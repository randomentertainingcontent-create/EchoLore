import { embed, embedMany } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

/**
 * Generate an embedding for a single text input using the user's OpenRouter key.
 *
 * OpenRouter routes embedding requests to providers like OpenAI (text-embedding-3-small,
 * 1536-dim) or Voyage AI. The dimension matches whatever the chosen model produces;
 * the supabase/schema.sql assumes 1536-dim by default (text-embedding-3-small).
 *
 * If you pick a different embedding model with different dimensions, update the
 * `vector(N)` column in supabase/schema.sql accordingly.
 */
export async function generateEmbedding(
  apiKey: string,
  model: string,
  text: string,
): Promise<number[]> {
  const openrouter = createOpenRouter({ apiKey });
  const { embedding } = await embed({
    model: openrouter.embedding(model),
    value: text,
  });
  return Array.from(embedding);
}

/** Generate embeddings for multiple texts in a single batched call. */
export async function generateEmbeddings(
  apiKey: string,
  model: string,
  texts: string[],
): Promise<number[][]> {
  const openrouter = createOpenRouter({ apiKey });
  const { embeddings } = await embedMany({
    model: openrouter.embedding(model),
    values: texts,
  });
  return embeddings.map((e) => Array.from(e));
}
