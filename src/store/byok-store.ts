"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ByokConfig, LlmProvider } from "@/types/echolore";

// Sensible defaults — Gemini is the default provider (generous free tier,
// good for open-source adoption). Users can switch in the Settings modal.
export const DEFAULT_BYOK: ByokConfig = {
  provider: "gemini",
  keys: {},
  // Vercel AI SDK model identifiers
  chatModel: "google/gemini-1.5-flash", // see vercel ai sdk google() provider
  loreModel: "google/gemini-1.5-flash",
  // OpenAI text-embedding-3-small is used for embeddings regardless of
  // chat provider, to keep dimension consistent at 1536.
  // (When the user picks Gemini but has no OpenAI key, the UI will warn
  // them that embeddings also need an OpenAI key, OR they can fall back
  // to a no-embeddings mode — handled in the RAG layer.)
  embedModel: "text-embedding-3-small",
};

interface ByokState {
  config: ByokConfig;
  setProvider: (p: LlmProvider) => void;
  setKey: (p: LlmProvider, key: string) => void;
  setChatModel: (m: string) => void;
  setLoreModel: (m: string) => void;
  clearAll: () => void;
  hasKey: (p: LlmProvider) => boolean;
  hasActiveKey: () => boolean;
}

export const useByokStore = create<ByokState>()(
  persist(
    (set, get) => ({
      config: DEFAULT_BYOK,

      setProvider: (p) =>
        set((s) => ({ config: { ...s.config, provider: p } })),

      setKey: (p, key) =>
        set((s) => ({
          config: {
            ...s.config,
            keys: { ...s.config.keys, [p]: key.trim() || undefined },
          },
        })),

      setChatModel: (m) =>
        set((s) => ({ config: { ...s.config, chatModel: m } })),

      setLoreModel: (m) =>
        set((s) => ({ config: { ...s.config, loreModel: m } })),

      clearAll: () =>
        set(() => ({ config: { ...DEFAULT_BYOK, keys: {} } })),

      hasKey: (p) => Boolean(get().config.keys[p]?.trim()),
      hasActiveKey: () => Boolean(get().config.keys[get().config.provider]?.trim()),
    }),
    {
      name: "echolore-byok",
      // Keys are stored in localStorage only. NEVER sent to the database.
      // They are sent per-request via the x-user-api-key header (see src/lib/byok/headers.ts).
      version: 1,
    },
  ),
);
