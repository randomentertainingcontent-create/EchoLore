"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ByokConfig } from "@/types/echolore";

// EchoLore uses two BYOK keys:
//   - OpenRouter for chat + lorebook (one key, hundreds of models, free tier available)
//   - Jina AI for embeddings (free tier, generous limits, 1024-dim)
//
// Defaults point at free-tier OpenRouter models so users can try it for $0.
export const DEFAULT_BYOK: ByokConfig = {
  openrouterKey: "",
  jinaKey: "",
  // Llama 3.2 3B is free on OpenRouter and great for roleplay.
  // Users can switch to anything: gpt-4o-mini, claude-3.5-sonnet, etc.
  chatModel: "meta-llama/llama-3.2-3b-instruct:free",
  loreModel: "meta-llama/llama-3.2-3b-instruct:free",
  embedModel: "jina-embeddings-v3",
  embedDimensions: 1024,
};

interface ByokState {
  config: ByokConfig;
  setOpenrouterKey: (key: string) => void;
  setJinaKey: (key: string) => void;
  setChatModel: (m: string) => void;
  setLoreModel: (m: string) => void;
  clearAll: () => void;
  hasKeys: () => boolean;       // both keys set
  hasChatKey: () => boolean;    // OpenRouter key set
  hasEmbedKey: () => boolean;   // Jina key set
}

export const useByokStore = create<ByokState>()(
  persist(
    (set, get) => ({
      config: DEFAULT_BYOK,

      setOpenrouterKey: (key) =>
        set((s) => ({ config: { ...s.config, openrouterKey: key.trim() } })),

      setJinaKey: (key) =>
        set((s) => ({ config: { ...s.config, jinaKey: key.trim() } })),

      setChatModel: (m) =>
        set((s) => ({ config: { ...s.config, chatModel: m } })),

      setLoreModel: (m) =>
        set((s) => ({ config: { ...s.config, loreModel: m } })),

      clearAll: () =>
        set(() => ({
          config: {
            ...DEFAULT_BYOK,
            openrouterKey: "",
            jinaKey: "",
          },
        })),

      hasKeys: () =>
        Boolean(get().config.openrouterKey.trim() && get().config.jinaKey.trim()),
      hasChatKey: () => Boolean(get().config.openrouterKey.trim()),
      hasEmbedKey: () => Boolean(get().config.jinaKey.trim()),
    }),
    {
      name: "echolore-byok",
      version: 3, // bumped from v2 (OpenAI-only) to v3 (OpenRouter + Jina)
      // Migrate from older BYOK shapes.
      migrate: (persisted: unknown, version: number) => {
        const old = (persisted && typeof persisted === "object"
          ? (persisted as { config?: Record<string, unknown> }).config
          : null) ?? {};
        if (version < 3) {
          // v1: multi-provider { keys: { openai, gemini, anthropic } }
          // v2: OpenAI-only { apiKey, chatModel, loreModel, embedModel }
          // v3: OpenRouter + Jina
          const v1Openai = (old.keys as { openai?: string } | undefined)?.openai;
          const v2Key = (old.apiKey as string | undefined);
          return {
            config: {
              openrouterKey: "",
              jinaKey: "",
              chatModel: DEFAULT_BYOK.chatModel,
              loreModel: DEFAULT_BYOK.loreModel,
              embedModel: DEFAULT_BYOK.embedModel,
              embedDimensions: DEFAULT_BYOK.embedDimensions,
              // We can't auto-migrate OpenAI keys to OpenRouter, so users re-paste.
              // But we keep the var name in case future versions need to detect it.
              ...(v1Openai || v2Key ? { _migratedNote: "OpenAI key dropped — paste OpenRouter key" } : {}),
            },
          };
        }
        return persisted as { config: ByokConfig };
      },
    },
  ),
);
