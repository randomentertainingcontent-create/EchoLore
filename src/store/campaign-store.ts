"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { localDb, type StoredCampaign } from "@/lib/local-db";
import type { Campaign, NewCampaignInput } from "@/types/echolore";

type CampaignPatch = Partial<Pick<Campaign, "title" | "worldDescription" | "userPersona" | "aiPersona">>;

interface CampaignState {
  campaigns: Campaign[];
  activeId: string | null;
  activeWorldState: string | null;
  activeWorldStateUpdatedAt: string | null;
  lorePending: boolean;
  loading: boolean;
  error: string | null;
  fetchAll: () => Promise<void>;
  create: (input: NewCampaignInput) => Promise<Campaign>;
  remove: (id: string) => Promise<void>;
  setActive: (id: string | null) => void;
  hydrateActive: (id: string) => Promise<void>;
  update: (id: string, patch: CampaignPatch) => Promise<Campaign>;
  saveLore: (id: string, state: Record<string, unknown>) => Promise<void>;
  setLorePending: (pending: boolean) => void;
  touch: (id: string) => Promise<void>;
  duplicate: (id: string) => Promise<Campaign>;
}

function plain({ worldState: _state, worldStateUpdatedAt: _at, ...campaign }: StoredCampaign): Campaign {
  return campaign;
}

function message(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export const useCampaignStore = create<CampaignState>()(
  persist(
    (set, get) => {
      const showState = (stored: StoredCampaign | null) => set({
        activeWorldState: stored ? JSON.stringify(stored.worldState ?? {}) : null,
        activeWorldStateUpdatedAt: stored?.worldStateUpdatedAt ?? null,
      });
      return {
        campaigns: [],
        activeId: null,
        activeWorldState: null,
        activeWorldStateUpdatedAt: null,
        lorePending: false,
        loading: false,
        error: null,

        fetchAll: async () => {
          set({ loading: true, error: null });
          try {
            const stored = await localDb.listCampaigns();
            const campaigns = stored.map(plain);
            const activeId = campaigns.some((c) => c.id === get().activeId) ? get().activeId : null;
            set({ campaigns, activeId, loading: false });
          } catch (error) {
            set({ loading: false, error: message(error, "Could not load your worlds.") });
          }
        },

        create: async (input) => {
          const now = new Date().toISOString();
          const stored: StoredCampaign = {
            id: crypto.randomUUID(), userId: "local", title: input.title, worldDescription: input.worldDescription,
            userPersona: input.userPersona, aiPersona: input.aiPersona, createdAt: now, updatedAt: now,
            worldState: input.startingState ?? {}, worldStateUpdatedAt: now,
          };
          await localDb.putCampaign(stored);
          const campaign = plain(stored);
          set((s) => ({ campaigns: [campaign, ...s.campaigns], activeId: campaign.id, lorePending: false, error: null }));
          showState(stored);
          return campaign;
        },

        remove: async (id) => {
          await localDb.deleteCampaign(id);
          set((s) => ({
            campaigns: s.campaigns.filter((c) => c.id !== id),
            activeId: s.activeId === id ? null : s.activeId,
            ...(s.activeId === id ? { activeWorldState: null, activeWorldStateUpdatedAt: null, lorePending: false } : {}),
          }));
        },

        setActive: (id) => {
          if (id === get().activeId) return;
          if (id !== null && !get().campaigns.some((c) => c.id === id)) return;
          set({ activeId: id, activeWorldState: null, activeWorldStateUpdatedAt: null, lorePending: false });
        },

        hydrateActive: async (id) => {
          try {
            const stored = await localDb.getCampaign(id);
            if (get().activeId === id) showState(stored);
          } catch {
            if (get().activeId === id) showState(null);
          }
        },

        update: async (id, patch) => {
          const stored = await localDb.getCampaign(id);
          if (!stored) throw new Error("This world no longer exists.");
          const next: StoredCampaign = { ...stored, ...patch, updatedAt: new Date().toISOString() };
          await localDb.putCampaign(next);
          const campaign = plain(next);
          set((s) => ({ campaigns: s.campaigns.map((c) => (c.id === id ? campaign : c)) }));
          return campaign;
        },

        saveLore: async (id, state) => {
          const stored = await localDb.getCampaign(id);
          if (!stored) throw new Error("This world no longer exists.");
          const next: StoredCampaign = { ...stored, worldState: state, worldStateUpdatedAt: new Date().toISOString() };
          await localDb.putCampaign(next);
          if (get().activeId === id) showState(next);
        },

        setLorePending: (lorePending) => set({ lorePending }),

        touch: async (id) => {
          const stored = await localDb.getCampaign(id);
          if (!stored) return;
          const next = { ...stored, updatedAt: new Date().toISOString() };
          await localDb.putCampaign(next);
          set((s) => ({ campaigns: [plain(next), ...s.campaigns.filter((c) => c.id !== id)] }));
        },

        duplicate: async (id) => {
          const source = await localDb.getCampaign(id);
          if (!source) throw new Error("This world no longer exists.");
          const suffix = " (copy)";
          const title = source.title.length + suffix.length > 120 ? `${source.title.slice(0, 120 - suffix.length)}${suffix}` : `${source.title}${suffix}`;
          return get().create({ title, worldDescription: source.worldDescription, userPersona: source.userPersona, aiPersona: source.aiPersona, startingState: source.worldState });
        },
      };
    },
    {
      name: "echolore-active-campaign",
      version: 2,
      partialize: (s) => ({ activeId: s.activeId }),
      migrate: () => ({ activeId: null }),
      merge: (persisted, current) => {
        const saved = persisted && typeof persisted === "object" ? persisted as { activeId?: unknown } : {};
        return { ...current, activeId: typeof saved.activeId === "string" ? saved.activeId : null };
      },
    },
  ),
);
