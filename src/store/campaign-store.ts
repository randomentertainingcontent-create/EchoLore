"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Campaign, NewCampaignInput } from "@/types/echolore";

// From the API: world_state.state_json comes back as a parsed JSON object (Supabase
// auto-parses JSONB columns). We stringify it for the chat-window's JSON viewer.
type CampaignWithState = Campaign & { worldState?: { stateJson: unknown } | null };

interface CampaignState {
  campaigns: Campaign[];
  activeId: string | null;
  activeWorldState: string | null; // stringified JSON of the world_state row
  loading: boolean;
  error: string | null;

  fetchAll: (userId: string) => Promise<void>;
  create: (userId: string, input: NewCampaignInput) => Promise<Campaign>;
  remove: (userId: string, id: string) => Promise<void>;
  setActive: (id: string | null) => void;
  hydrateActive: (userId: string, id: string) => Promise<void>;
}

function stringifyState(stateJson: unknown): string | null {
  if (stateJson == null) return null;
  if (typeof stateJson === "string") return stateJson;
  try {
    return JSON.stringify(stateJson);
  } catch {
    return null;
  }
}

export const useCampaignStore = create<CampaignState>()(
  persist(
    (set) => ({
      campaigns: [],
      activeId: null,
      activeWorldState: null,
      loading: false,
      error: null,

      fetchAll: async (userId) => {
        set({ loading: true, error: null });
        try {
          const res = await fetch("/api/campaigns", {
            headers: { "x-user-id": userId },
          });
          if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load campaigns");
          const { campaigns } = await res.json();
          set({ campaigns, loading: false });
        } catch (e) {
          set({ error: (e as Error).message, loading: false });
        }
      },

      create: async (userId, input) => {
        const res = await fetch("/api/campaigns", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-user-id": userId },
          body: JSON.stringify(input),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? "Failed to create campaign");
        const { campaign } = await res.json() as { campaign: CampaignWithState };
        set((s) => ({
          campaigns: [campaign as unknown as Campaign, ...s.campaigns],
          activeId: campaign.id,
          activeWorldState: stringifyState(campaign.worldState?.stateJson),
        }));
        return campaign as unknown as Campaign;
      },

      remove: async (userId, id) => {
        const res = await fetch(`/api/campaigns/${id}`, {
          method: "DELETE",
          headers: { "x-user-id": userId },
        });
        if (!res.ok) throw new Error((await res.json()).error ?? "Failed to delete campaign");
        set((s) => ({
          campaigns: s.campaigns.filter((c) => c.id !== id),
          activeId: s.activeId === id ? null : s.activeId,
          activeWorldState: s.activeId === id ? null : s.activeWorldState,
        }));
      },

      setActive: (id) => set({ activeId: id, activeWorldState: null }),

      hydrateActive: async (userId, id) => {
        const res = await fetch(`/api/campaigns/${id}`, {
          headers: { "x-user-id": userId },
        });
        if (!res.ok) {
          set({ activeWorldState: null });
          return;
        }
        const { campaign } = await res.json() as { campaign: CampaignWithState };
        set({ activeWorldState: stringifyState(campaign.worldState?.stateJson) });
      },
    }),
    {
      name: "echolore-active-campaign",
      // Persist activeId AND campaigns so that on page reload:
      //   1. activeId restores → the correct campaign is auto-selected
      //   2. campaigns restores → activeCampaign is found immediately → no flash
      //      of the welcome screen while fetchAll is in-flight
      // activeWorldState is NOT persisted — it gets re-hydrated via hydrateActive()
      // (which also picks up lorebook auto-updates from the background updater).
      partialize: (s) => ({ activeId: s.activeId, campaigns: s.campaigns }),
    },
  ),
);
