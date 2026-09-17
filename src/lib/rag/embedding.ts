import { embed, embedMany } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { EMBED_DIMENSIONS, EMBED_MODEL } from "@/lib/byok/headers";

export function validateEmbedding(value: number[]): number[] {
  if (value.length !== EMBED_DIMENSIONS || value.some((n) => !Number.isFinite(n))) {
    throw new Error("Invalid embedding");
  }
  return value;
}

export async function generateEmbedding(apiKey: string, model: string, text: string): Promise<number[]> {
  if (model !== EMBED_MODEL || !text.trim() || text.length > 16000) throw new Error("Invalid embedding input");
  const openrouter = createOpenRouter({ apiKey });
  const { embedding } = await embed({
    model: openrouter.embedding(EMBED_MODEL),
    value: text,
    maxRetries: 0,
    abortSignal: AbortSignal.timeout(15000),
  });
  return validateEmbedding(Array.from(embedding));
}

export async function generateEmbeddings(apiKey: string, model: string, texts: string[]): Promise<number[][]> {
  if (model !== EMBED_MODEL || texts.length === 0 || texts.length > 16 || texts.some((text) => !text.trim() || text.length > 16000)) {
    throw new Error("Invalid embedding input");
  }
  const openrouter = createOpenRouter({ apiKey });
  const { embeddings } = await embedMany({
    model: openrouter.embedding(EMBED_MODEL),
    values: texts,
    maxRetries: 0,
    abortSignal: AbortSignal.timeout(15000),
  });
  if (embeddings.length !== texts.length) throw new Error("Invalid embeddings");
  return embeddings.map((value) => validateEmbedding(Array.from(value)));
}
