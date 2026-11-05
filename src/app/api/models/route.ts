import { NextRequest } from "next/server";
import { requireUserId } from "@/lib/auth";
import { errorResponse, RequestError } from "../_lib/validation";
import type { ModelSummary } from "@/types/echolore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let cache: { at: number; models: ModelSummary[] } | null = null;
const TTL = 60 * 60 * 1000;

function perMillion(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 1_000_000 * 1000) / 1000 : null;
}

/** OpenRouter's public text-model catalogue, trimmed and cached for an hour. */
export async function GET(req: NextRequest) {
  try {
    if (!await requireUserId(req)) throw new RequestError(401, "Unauthorized");
    if (!cache || Date.now() - cache.at > TTL) {
      const res = await fetch("https://openrouter.ai/api/v1/models", { signal: AbortSignal.timeout(10000), headers: { accept: "application/json" } });
      if (!res.ok) throw new RequestError(502, "Could not load the model list from OpenRouter.");
      const body = await res.json() as { data?: unknown[] };
      const models: ModelSummary[] = [];
      for (const raw of Array.isArray(body.data) ? body.data : []) {
        if (!raw || typeof raw !== "object") continue;
        const m = raw as Record<string, unknown>;
        if (typeof m.id !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$/.test(m.id)) continue;
        const arch = m.architecture as Record<string, unknown> | undefined;
        const outputs = Array.isArray(arch?.output_modalities) ? arch.output_modalities : ["text"];
        if (!outputs.includes("text")) continue;
        const pricing = (m.pricing ?? {}) as Record<string, unknown>;
        const promptPrice = perMillion(pricing.prompt);
        const completionPrice = perMillion(pricing.completion);
        models.push({
          id: m.id,
          name: typeof m.name === "string" ? m.name.slice(0, 120) : m.id,
          contextLength: typeof m.context_length === "number" ? m.context_length : null,
          promptPrice,
          completionPrice,
          free: m.id.endsWith(":free") || (promptPrice === 0 && completionPrice === 0),
        });
      }
      if (!models.length) throw new RequestError(502, "OpenRouter returned no models.");
      cache = { at: Date.now(), models };
    }
    return Response.json({ models: cache.models }, { headers: { "cache-control": "private, max-age=600" } });
  } catch (error) { return errorResponse(error); }
}
