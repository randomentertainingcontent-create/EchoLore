"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { buildAuthHeaders } from "@/lib/byok/headers";
import { browserClient } from "@/lib/supabase";
import type { Campaign, NewCampaignInput } from "@/types/echolore";

type CampaignWithState = Campaign & { worldState?: { stateJson: unknown; updatedAt?: string | null } | null };

interface CampaignState {
  campaigns: Campaign[];
  ownerId: string | null;
  activeId: string | null;
  activeWorldState: string | null;
  activeWorldStateUpdatedAt: string | null;
  lorePending: boolean;
  loading: boolean;
  error: string | null;
  setOwner: (ownerId: string | null) => void;
  reset: () => void;
  fetchAll: (userId: string) => Promise<void>;
  create: (userId: string, input: NewCampaignInput) => Promise<Campaign>;
  remove: (userId: string, id: string) => Promise<void>;
  setActive: (id: string | null) => void;
  hydrateActive: (userId: string, id: string) => Promise<void>;
  update: (userId: string, id: string, patch: Partial<Pick<Campaign, "title" | "worldDescription" | "userPersona" | "aiPersona">>) => Promise<Campaign>;
  saveLore: (userId: string, id: string, state: Record<string, unknown>) => Promise<void>;
  setLorePending: (pending: boolean) => void;
  touch: (id: string) => void;
  duplicate: (userId: string, id: string) => Promise<Campaign>;
}

function stringifyState(stateJson: unknown): string | null {
  if (stateJson == null) return null;
  if (typeof stateJson === "string") return stateJson;
  try { return JSON.stringify(stateJson); } catch { return null; }
}

function savedSelection(persisted: unknown) {
  const saved = persisted && typeof persisted === "object" ? persisted as Record<string, unknown> : {};
  const ownerId = typeof saved.ownerId === "string" && saved.ownerId ? saved.ownerId : null;
  return { ownerId, activeId: ownerId && typeof saved.activeId === "string" ? saved.activeId : null };
}

const empty = { campaigns: [] as Campaign[], activeId: null, activeWorldState: null, activeWorldStateUpdatedAt: null, lorePending: false, loading: false, error: null };

export const useCampaignStore = create<CampaignState>()(
  persist(
    (set, get) => {
      let owner: string | null = null;
      let generation = 0;
      let listRequest = 0;
      let stateRequest = 0;
      const current = (userId: string, epoch: number) => owner === userId && get().ownerId === userId && generation === epoch;
      const assertSession = async (userId: string, epoch: number) => {
        const { data, error } = await browserClient().auth.getSession();
        if (error || data.session?.user.id !== userId || !current(userId, epoch)) throw new Error("Your account changed. Please try again.");
      };
      const headersFor = async (userId: string, epoch: number) => {
        await assertSession(userId, epoch);
        const headers = await buildAuthHeaders();
        await assertSession(userId, epoch);
        return headers;
      };
      const invalidateList = () => { listRequest += 1; };
      return {
        ...empty,
        ownerId: null,
        setOwner: (ownerId) => {
          if (owner === ownerId && get().ownerId === ownerId && ownerId !== null) return;
          const activeId = owner === null && ownerId !== null && get().ownerId === ownerId ? get().activeId : null;
          owner = ownerId;
          generation += 1;
          invalidateList();
          stateRequest += 1;
          set({ ...empty, campaigns: [], ownerId, activeId });
        },
        reset: () => {
          owner = null;
          generation += 1;
          invalidateList();
          stateRequest += 1;
          set({ ...empty, campaigns: [], ownerId: null });
        },
        fetchAll: async (userId) => {
          const epoch = generation;
          if (!current(userId, epoch)) return;
          const request = ++listRequest;
          set({ loading: true, error: null });
          try {
            const headers = await headersFor(userId, epoch);
            const res = await fetch("/api/campaigns", { headers });
            const body = await res.json();
            await assertSession(userId, epoch);
            if (request !== listRequest) return;
            if (!res.ok) throw new Error(body.error ?? "Failed to load campaigns");
            const campaigns = body.campaigns as Campaign[];
            if (!Array.isArray(campaigns) || campaigns.some((c) => c.userId !== userId)) throw new Error("Could not verify world ownership.");
            const activeId = campaigns.some((c) => c.id === get().activeId) ? get().activeId : null;
            if (activeId !== get().activeId) stateRequest += 1;
            set({ campaigns, activeId, activeWorldState: activeId ? get().activeWorldState : null, loading: false });
          } catch (e) {
            if (current(userId, epoch) && request === listRequest) set({ error: e instanceof Error ? e.message : "Failed to load campaigns", loading: false });
          }
        },
        create: async (userId, input) => {
          const epoch = generation;
          const headers = await headersFor(userId, epoch);
          if (!current(userId, epoch)) throw new Error("Your account changed. Please try again.");
          const res = await fetch("/api/campaigns", {
            method: "POST",
            headers: { ...headers, "Content-Type": "application/json" },
            body: JSON.stringify(input),
          });
          const body = await res.json();
          await assertSession(userId, epoch);
          if (!current(userId, epoch)) throw new Error("Your account changed. Please try again.");
          if (!res.ok) throw new Error(body.error ?? "Failed to create campaign");
          const campaign = body.campaign as CampaignWithState;
          if (campaign?.userId !== userId) throw new Error("Could not verify world ownership.");
          invalidateList();
          stateRequest += 1;
          set((s) => ({
            campaigns: [campaign, ...s.campaigns.filter((c) => c.id !== campaign.id)],
            activeId: campaign.id,
            activeWorldState: stringifyState(campaign.worldState?.stateJson),
            activeWorldStateUpdatedAt: campaign.worldState?.updatedAt ?? campaign.createdAt ?? null,
            lorePending: false,
            loading: false,
            error: null,
          }));
          return campaign;
        },
        remove: async (userId, id) => {
          const epoch = generation;
          const headers = await headersFor(userId, epoch);
          if (!current(userId, epoch)) throw new Error("Your account changed. Please try again.");
          const res = await fetch(`/api/campaigns/${encodeURIComponent(id)}`, { method: "DELETE", headers });
          const body = res.ok ? null : await res.json();
          await assertSession(userId, epoch);
          if (!current(userId, epoch)) throw new Error("Your account changed. Please try again.");
          if (!res.ok) throw new Error(body?.error ?? "Failed to delete campaign");
          invalidateList();
          if (get().activeId === id) stateRequest += 1;
          set((s) => ({
            campaigns: s.campaigns.filter((c) => c.id !== id),
            activeId: s.activeId === id ? null : s.activeId,
            activeWorldState: s.activeId === id ? null : s.activeWorldState,
            loading: false,
            error: null,
          }));
        },
        setActive: (id) => {
          if (!owner || owner !== get().ownerId || (id !== null && !get().campaigns.some((c) => c.id === id && c.userId === owner))) return;
          if (id === get().activeId) return;
          stateRequest += 1;
          set({ activeId: id, activeWorldState: null, activeWorldStateUpdatedAt: null, lorePending: false });
        },
        hydrateActive: async (userId, id) => {
          const epoch = generation;
          if (!current(userId, epoch) || get().activeId !== id) return;
          const request = ++stateRequest;
          const relevant = () => current(userId, epoch) && request === stateRequest && get().activeId === id;
          try {
            const headers = await headersFor(userId, epoch);
            const res = await fetch(`/api/campaigns/${encodeURIComponent(id)}`, { headers });
            const body = await res.json();
            await assertSession(userId, epoch);
            if (!relevant()) return;
            if (!res.ok) throw new Error(body.error ?? "Failed to load lorebook");
            const campaign = body.campaign as CampaignWithState;
            if (campaign?.userId !== userId || campaign.id !== id) throw new Error("Could not verify world ownership.");
            set({ activeWorldState: stringifyState(campaign.worldState?.stateJson), activeWorldStateUpdatedAt: campaign.worldState?.updatedAt ?? null });
          } catch {
            if (relevant()) set({ activeWorldState: null });
          }
        },
        update: async (userId, id, patch) => {
          const epoch = generation;
          const headers = await headersFor(userId, epoch);
          const res = await fetch(`/api/campaigns/${encodeURIComponent(id)}`, {
            method: "PATCH",
            headers: { ...headers, "Content-Type": "application/json" },
            body: JSON.stringify(patch),
          });
          const body = await res.json();
          await assertSession(userId, epoch);
          if (!res.ok) throw new Error(body.error ?? "Could not save your changes");
          const campaign = body.campaign as Campaign;
          if (campaign?.userId !== userId || campaign.id !== id) throw new Error("Could not verify world ownership.");
          invalidateList();
          set((s) => ({ campaigns: s.campaigns.map((c) => (c.id === id ? campaign : c)) }));
          return campaign;
        },
        saveLore: async (userId, id, state) => {
          const epoch = generation;
          const headers = await headersFor(userId, epoch);
          const res = await fetch(`/api/lorebook/${encodeURIComponent(id)}`, {
            method: "PUT",
            headers: { ...headers, "Content-Type": "application/json" },
            body: JSON.stringify({ state }),
          });
          const body = await res.json();
          await assertSession(userId, epoch);
          if (!res.ok) throw new Error(body.error ?? "Could not save the lorebook");
          if (get().activeId === id) {
            stateRequest += 1;
            set({ activeWorldState: stringifyState(body.state), activeWorldStateUpdatedAt: body.updatedAt ?? null });
          }
        },
        setLorePending: (lorePending) => set({ lorePending }),
        duplicate: async (userId, id) => {
          const epoch = generation;
          const headers = await headersFor(userId, epoch);
          const res = await fetch(`/api/campaigns/${encodeURIComponent(id)}`, { headers });
          const body = await res.json();
          if (!res.ok) throw new Error(body.error ?? "Could not copy this world");
          const source = body.campaign as CampaignWithState;
          const state = source.worldState?.stateJson;
          const suffix = " (copy)";
          return get().create(userId, {
            title: source.title.length + suffix.length > 120 ? `${source.title.slice(0, 120 - suffix.length)}${suffix}` : `${source.title}${suffix}`,
            worldDescription: source.worldDescription,
            userPersona: source.userPersona,
            aiPersona: source.aiPersona,
            startingState: state && typeof state === "object" && !Array.isArray(state) ? state as Record<string, unknown> : {},
          });
        },
        touch: (id) => set((s) => {
          const found = s.campaigns.find((c) => c.id === id);
          if (!found) return {};
          return { campaigns: [{ ...found, updatedAt: new Date().toISOString() }, ...s.campaigns.filter((c) => c.id !== id)] };
        }),
      };
    },
    {
      name: "echolore-active-campaign",
      version: 1,
      partialize: (s) => ({ activeId: s.activeId, ownerId: s.ownerId }),
      migrate: () => ({ activeId: null, ownerId: null }),
      merge: (persisted, current) => ({ ...current, ...savedSelection(persisted) }),
    },
  ),
);
