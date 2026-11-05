"use client";

import { buildByokHeaders, HDR_OPENROUTER_KEY } from "@/lib/byok/headers";
import { useByokStore } from "@/store/byok-store";
import type { MessageRole } from "@/types/echolore";

/** Memory vectors for story text, or null when indexing isn't possible right now. */
export async function embedTexts(texts: string[]): Promise<number[][] | null> {
  const key = useByokStore.getState().config.openrouterKey.trim();
  const clean = texts.map((t) => t.trim().slice(0, 16000)).filter(Boolean);
  if (!key || clean.length !== texts.length || !clean.length) return null;
  try {
    const res = await fetch("/api/embed", {
      method: "POST",
      headers: { "Content-Type": "application/json", [HDR_OPENROUTER_KEY]: key },
      body: JSON.stringify({ texts: clean }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    const body = await res.json() as { embeddings?: number[][] };
    return Array.isArray(body.embeddings) && body.embeddings.length === texts.length ? body.embeddings : null;
  } catch {
    return null;
  }
}

/** Ask the lorebook keeper for an updated world state. */
export async function requestLoreUpdate(state: Record<string, unknown>, recent: { role: MessageRole; content: string }[]): Promise<Record<string, unknown>> {
  const res = await fetch("/api/lore", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...buildByokHeaders(useByokStore.getState().config) },
    body: JSON.stringify({ state, recent: recent.filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: m.content.slice(0, 16000) })) }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.state) throw new Error(body.error ?? "Lorebook update failed");
  return body.state as Record<string, unknown>;
}
