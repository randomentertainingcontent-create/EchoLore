import { NextRequest } from "next/server";
import { HDR_OPENROUTER_KEY, EMBED_MODEL } from "@/lib/byok/headers";
import { generateEmbeddings } from "@/lib/rag/embedding";
import { embedSchema, errorResponse, readJson, RequestError } from "../_lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Turn story text into memory vectors with the player's key. Nothing is stored. */
export async function POST(req: NextRequest) {
  try {
    const key = req.headers.get(HDR_OPENROUTER_KEY)?.trim();
    if (!key || !/^[\x21-\x7e]{1,512}$/.test(key)) throw new RequestError(400, "Add a valid OpenRouter key in Settings.");
    const parsed = embedSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new RequestError(400, "Invalid embedding request");
    try {
      return Response.json({ embeddings: await generateEmbeddings(key, EMBED_MODEL, parsed.data.texts) });
    } catch {
      throw new RequestError(502, "Memory indexing is unavailable right now.");
    }
  } catch (error) { return errorResponse(error); }
}
