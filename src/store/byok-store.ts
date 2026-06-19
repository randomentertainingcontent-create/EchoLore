"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ByokConfig } from "@/types/echolore";

// EchoLore is OpenRouter-only.
// One key handles chat + lorebook + embeddings via OpenRouter's routing layer.
// OpenRouter gives access to hundreds of models with one signup, including
// free-tier options (Llama 3.2, Gemini, etc.).
//
// Sign up at https://openrouter.ai/keys — generous free tier, no credit card
// required to start.
//
// Defaults: gpt-oss-20b:free is a reasoning model that's reliably available on
// the free tier. Embeddings use OpenAI's text-embedding-3-small (1536-dim)
// routed via OpenRouter — matches the vector(N) column in supabase/schema.sql.
export const DEFAULT_BYOK: ByokConfig = {
  openrouterKey: "",
  chatModel: "openai/gpt-oss-20b:free",
  loreModel: "openai/gpt-oss-20b:free",
  embedModel: "text-embedding-3-small",
  embedDimensions: 1536,
};

interface ByokState {
  config: ByokConfig;
  setOpenrouterKey: (key: string) => void;
  setChatModel: (m: string) => void;
  setLoreModel: (m: string) => void;
  clearAll: () => void;
  hasKey: () => boolean;
}

export const useByokStore = create<ByokState>()(
  persist(
    (set, get) => ({
      config: DEFAULT_BYOK,

      setOpenrouterKey: (key) =>
        set((s) => ({ config: { ...s.config, openrouterKey: key.trim() } })),

      setChatModel: (m) =>
        set((s) => ({ config: { ...s.config, chatModel: m } })),

      setLoreModel: (m) =>
        set((s) => ({ config: { ...s.config, loreModel: m } })),

      clearAll: () =>
        set(() => ({ config: { ...DEFAULT_BYOK, openrouterKey: "" } })),

      hasKey: () => Boolean(get().config.openrouterKey.trim()),
    }),
    {
      name: "echolore-byok",
      version: 4, // v3 was OpenRouter+Jina (never shipped), v4 is OpenRouter-only
      migrate: (persisted: unknown, version: number) => {
        if (version < 4 && persisted && typeof persisted === "object") {
          // Drop everything from older versions — user pastes a fresh OpenRouter key.
          return { config: { ...DEFAULT_BYOK, openrouterKey: "" } };
        }
        return persisted as { config: ByokConfig };
      },
    },
  ),
);
