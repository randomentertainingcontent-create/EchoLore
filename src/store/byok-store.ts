"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_CHAT_MODEL, DEFAULT_LORE_MODEL, EMBED_DIMENSIONS, EMBED_MODEL } from "@/lib/byok/headers";
import type { ByokConfig } from "@/types/echolore";

export const DEFAULT_BYOK: ByokConfig = {
  openrouterKey: "",
  chatModel: DEFAULT_CHAT_MODEL,
  loreModel: DEFAULT_LORE_MODEL,
  embedModel: EMBED_MODEL,
  embedDimensions: EMBED_DIMENSIONS,
};

interface ByokState {
  config: ByokConfig;
  ownerId: string | null;
  setOwner: (ownerId: string | null) => void;
  clearKey: () => void;
  setOpenrouterKey: (key: string) => void;
  setChatModel: (m: string) => void;
  setLoreModel: (m: string) => void;
  clearAll: () => void;
  hasKey: () => boolean;
}

function savedSettings(persisted: unknown, preserveKey: boolean) {
  const saved = persisted && typeof persisted === "object" ? persisted as Record<string, unknown> : {};
  const old = saved.config && typeof saved.config === "object" ? saved.config as Record<string, unknown> : {};
  const ownerId = typeof saved.ownerId === "string" && saved.ownerId ? saved.ownerId : null;
  return {
    ownerId,
    config: {
      ...DEFAULT_BYOK,
      chatModel: typeof old.chatModel === "string" && old.chatModel.trim() ? old.chatModel : DEFAULT_BYOK.chatModel,
      loreModel: typeof old.loreModel === "string" && old.loreModel.trim() ? old.loreModel : DEFAULT_BYOK.loreModel,
      openrouterKey: preserveKey && ownerId && typeof old.openrouterKey === "string" ? old.openrouterKey.trim() : "",
    },
  };
}

export const useByokStore = create<ByokState>()(
  persist(
    (set, get) => ({
      config: { ...DEFAULT_BYOK },
      ownerId: null,
      setOwner: (ownerId) => set((s) => ({
        ownerId,
        config: { ...s.config, openrouterKey: ownerId && s.ownerId === ownerId ? s.config.openrouterKey : "" },
      })),
      clearKey: () => set((s) => ({ config: { ...s.config, openrouterKey: "" } })),
      setOpenrouterKey: (key) => set((s) => ({ config: { ...s.config, openrouterKey: s.ownerId ? key.trim() : "" } })),
      setChatModel: (m) => set((s) => ({ config: { ...s.config, chatModel: m } })),
      setLoreModel: (m) => set((s) => ({ config: { ...s.config, loreModel: m } })),
      clearAll: () => set({ config: { ...DEFAULT_BYOK } }),
      hasKey: () => Boolean(get().ownerId && get().config.openrouterKey.trim()),
    }),
    {
      name: "echolore-byok",
      version: 6,
      partialize: (s) => ({ config: s.config, ownerId: s.ownerId }),
      migrate: (persisted) => savedSettings(persisted, false),
      merge: (persisted, current) => ({ ...current, ...savedSettings(persisted, true) }),
    },
  ),
);
