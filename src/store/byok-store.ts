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
// Defaults:
//   - chatModel: openai/gpt-oss-120b:free — a 120B reasoning model. Bigger =
//     better roleplay quality. We strip reasoning tokens (reasoning: { exclude:
//     true }) so the model's inner monologue never leaks into the response.
//   - loreModel: openai/gpt-oss-20b:free — smaller/faster for the background
//     lorebook updater (doesn't need to be smart, just needs to output JSON).
//   - embedModel: text-embedding-3-small (1536-dim via OpenRouter, matches the
//     vector(N) column in supabase/schema.sql).
export const DEFAULT_BYOK: ByokConfig = {
  openrouterKey: "",
  chatModel: "openai/gpt-oss-120b:free",
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
      version: 5, // v4 was gpt-oss-20b default, v5 is gpt-oss-120b default
      migrate: (persisted: unknown, version: number) => {
        if (version < 5 && persisted && typeof persisted === "object") {
          // Preserve the user's key but upgrade the default models.
          const old = (persisted as { config?: { openrouterKey?: string } }).config;
          return {
            config: {
              ...DEFAULT_BYOK,
              openrouterKey: old?.openrouterKey ?? "",
            },
          };
        }
        return persisted as { config: ByokConfig };
      },
    },
  ),
);
