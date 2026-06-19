"use client";

import { create } from "zustand";
import type { Campaign, NewCampaignInput } from "@/types/echolore";

type CampaignWithState = Campaign & { worldState?: { stateJson: string } | null };

interface CampaignState {
  campaigns: Campaign[];
  activeId: string | null;
  activeWorldState: string | null; // raw JSON string of the world_state row
  loading: boolean;
  error: string | null;

  fetchAll: (userId: string) => Promise<void>;
  create: (userId: string, input: NewCampaignInput) => Promise<Campaign>;
  remove: (userId: string, id: string) => Promise<void>;
  setActive: (id: string | null) => void;
  hydrateActive: (userId: string, id: string) => Promise<void>;
}

export const useCampaignStore = create<CampaignState>((set, get) => ({
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
      campaigns: [{ ...campaign, worldState: undefined } as unknown as Campaign, ...s.campaigns],
      activeId: campaign.id,
      activeWorldState: campaign.worldState?.stateJson ?? null,
    }));
    return campaign;
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
    set({ activeWorldState: campaign.worldState?.stateJson ?? null });
  },
}));
