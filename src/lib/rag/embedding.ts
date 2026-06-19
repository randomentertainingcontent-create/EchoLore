import { embed, embedMany } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

/**
 * Generate an embedding for a single text input using the user's OpenAI key.
 * Returns a Float[] of dimension 1536 (text-embedding-3-small).
 */
export async function generateEmbedding(
  apiKey: string,
  model: string,
  text: string,
): Promise<number[]> {
  const openai = createOpenAI({ apiKey });
  const { embedding } = await embed({
    model: openai.embedding(model),
    value: text,
  });
  return Array.from(embedding);
}

/**
 * Generate embeddings for multiple texts in a single batched call.
 * Useful for re-embedding older messages if the model changes.
 */
export async function generateEmbeddings(
  apiKey: string,
  model: string,
  texts: string[],
): Promise<number[][]> {
  const openai = createOpenAI({ apiKey });
  const { embeddings } = await embedMany({
    model: openai.embedding(model),
    values: texts,
  });
  return embeddings.map((e) => Array.from(e));
}
