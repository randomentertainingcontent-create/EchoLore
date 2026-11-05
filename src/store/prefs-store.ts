"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ResponseLength } from "@/types/echolore";

export type TextSize = "sm" | "md" | "lg" | "xl";
export type StoryFont = "sans" | "serif";

interface PrefsState {
  responseLength: ResponseLength;
  creativity: number;
  textSize: TextSize;
  storyFont: StoryFont;
  setResponseLength: (value: ResponseLength) => void;
  setCreativity: (value: number) => void;
  setTextSize: (value: TextSize) => void;
  setStoryFont: (value: StoryFont) => void;
  reset: () => void;
}

export const DEFAULT_PREFS = { responseLength: "medium" as ResponseLength, creativity: 0.85, textSize: "md" as TextSize, storyFont: "serif" as StoryFont };

const clamp = (value: number) => Math.min(1.5, Math.max(0, Math.round(value * 100) / 100));

/** Per-browser storytelling & reading preferences (no secrets live here). */
export const usePrefsStore = create<PrefsState>()(
  persist(
    (set) => ({
      ...DEFAULT_PREFS,
      setResponseLength: (responseLength) => set({ responseLength }),
      setCreativity: (value) => set({ creativity: clamp(value) }),
      setTextSize: (textSize) => set({ textSize }),
      setStoryFont: (storyFont) => set({ storyFont }),
      reset: () => set({ ...DEFAULT_PREFS }),
    }),
    {
      name: "echolore-prefs",
      version: 1,
      merge: (persisted, current) => {
        const saved = (persisted && typeof persisted === "object" ? persisted : {}) as Partial<PrefsState>;
        return {
          ...current,
          responseLength: ["short", "medium", "long"].includes(saved.responseLength as string) ? saved.responseLength! : current.responseLength,
          creativity: typeof saved.creativity === "number" && Number.isFinite(saved.creativity) ? clamp(saved.creativity) : current.creativity,
          textSize: ["sm", "md", "lg", "xl"].includes(saved.textSize as string) ? saved.textSize! : current.textSize,
          storyFont: saved.storyFont === "sans" || saved.storyFont === "serif" ? saved.storyFont : current.storyFont,
        };
      },
    },
  ),
);
