"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ByokConfig } from "@/types/echolore";

// EchoLore is OpenAI-only. One key handles chat, lorebook updates, and embeddings.
// Defaults favor gpt-4o-mini — cheap, fast, widely available, free-tier friendly.
export const DEFAULT_BYOK: ByokConfig = {
  apiKey: "",
  chatModel: "gpt-4o-mini",
  loreModel: "gpt-4o-mini",
  embedModel: "text-embedding-3-small",
};

interface ByokState {
  config: ByokConfig;
  setApiKey: (key: string) => void;
  setChatModel: (m: string) => void;
  setLoreModel: (m: string) => void;
  clearAll: () => void;
  hasKey: () => boolean;
}

export const useByokStore = create<ByokState>()(
  persist(
    (set, get) => ({
      config: DEFAULT_BYOK,

      setApiKey: (key) =>
        set((s) => ({ config: { ...s.config, apiKey: key.trim() } })),

      setChatModel: (m) =>
        set((s) => ({ config: { ...s.config, chatModel: m } })),

      setLoreModel: (m) =>
        set((s) => ({ config: { ...s.config, loreModel: m } })),

      clearAll: () =>
        set(() => ({ config: { ...DEFAULT_BYOK, apiKey: "" } })),

      hasKey: () => Boolean(get().config.apiKey.trim()),
    }),
    {
      name: "echolore-byok",
      // Keys are stored in localStorage only. NEVER sent to the database.
      // They are sent per-request via the x-user-api-key header (see src/lib/byok/headers.ts).
      version: 2,
      // Migrate from v1 (multi-provider {gemini, openai, anthropic}) to v2 (OpenAI-only).
      migrate: (persisted: unknown, version: number) => {
        if (version < 2 && persisted && typeof persisted === "object") {
          const old = persisted as { config?: { keys?: { openai?: string }; chatModel?: string; loreModel?: string } };
          const openaiKey = old.config?.keys?.openai ?? "";
          return {
            config: {
              apiKey: openaiKey,
              chatModel: old.config?.chatModel?.replace(/^openai\//, "") ?? DEFAULT_BYOK.chatModel,
              loreModel: old.config?.loreModel?.replace(/^openai\//, "") ?? DEFAULT_BYOK.loreModel,
              embedModel: DEFAULT_BYOK.embedModel,
            },
          };
        }
        return persisted as { config: ByokConfig };
      },
    },
  ),
);
