import { NextRequest } from "next/server";
import { HDR_OPENROUTER_KEY } from "@/lib/byok/headers";
import { errorResponse, RequestError } from "../_lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Verify an OpenRouter key and report its credit status. The key is never stored or logged. */
export async function POST(req: NextRequest) {
  try {
    const key = req.headers.get(HDR_OPENROUTER_KEY)?.trim();
    if (!key || !/^[\x21-\x7e]{1,512}$/.test(key)) throw new RequestError(400, "Enter an OpenRouter API key first.");
    const res = await fetch("https://openrouter.ai/api/v1/key", {
      headers: { Authorization: `Bearer ${key}`, accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    if (res.status === 401 || res.status === 403) {
      return Response.json({ ok: false, error: "OpenRouter rejected this key. Copy it again from openrouter.ai/keys." });
    }
    if (!res.ok) throw new RequestError(502, "Could not reach OpenRouter to check the key. Try again shortly.");
    const body = await res.json() as { data?: Record<string, unknown> };
    const data = body.data ?? {};
    const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);
    return Response.json({
      ok: true,
      label: typeof data.label === "string" ? data.label.slice(0, 80) : null,
      usage: num(data.usage),
      limit: num(data.limit),
      limitRemaining: num(data.limit_remaining),
      freeTier: data.is_free_tier === true,
    });
  } catch (error) { return errorResponse(error); }
}
