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
  setOpenrouterKey: (key: string) => void;
  setChatModel: (m: string) => void;
  setLoreModel: (m: string) => void;
  clearAll: () => void;
}

/** The OpenRouter key and model choices. Stored only in this browser. */
export const useByokStore = create<ByokState>()(
  persist(
    (set) => ({
      config: { ...DEFAULT_BYOK },
      setOpenrouterKey: (key) => set((s) => ({ config: { ...s.config, openrouterKey: key.trim() } })),
      setChatModel: (m) => set((s) => ({ config: { ...s.config, chatModel: m } })),
      setLoreModel: (m) => set((s) => ({ config: { ...s.config, loreModel: m } })),
      clearAll: () => set({ config: { ...DEFAULT_BYOK } }),
    }),
    {
      name: "echolore-byok",
      version: 7,
      partialize: (s) => ({ config: s.config }),
      migrate: (persisted) => persisted as { config: ByokConfig },
      merge: (persisted, current) => {
        const saved = persisted && typeof persisted === "object" ? persisted as Record<string, unknown> : {};
        const old = saved.config && typeof saved.config === "object" ? saved.config as Record<string, unknown> : {};
        const text = (value: unknown, fallback: string) => (typeof value === "string" && value.trim() ? value : fallback);
        return {
          ...current,
          config: {
            ...DEFAULT_BYOK,
            chatModel: text(old.chatModel, DEFAULT_BYOK.chatModel),
            loreModel: text(old.loreModel, DEFAULT_BYOK.loreModel),
            openrouterKey: typeof old.openrouterKey === "string" ? old.openrouterKey.trim() : "",
          },
        };
      },
    },
  ),
);
