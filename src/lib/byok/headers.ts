import { z } from "zod";
import type { ByokConfig } from "@/types/echolore";

export const HDR_OPENROUTER_KEY = "x-openrouter-key";
export const HDR_CHAT_MODEL = "x-chat-model";
export const HDR_LORE_MODEL = "x-lore-model";
export const HDR_EMBED_MODEL = "x-embed-model";
export const HDR_EMBED_DIMENSIONS = "x-embed-dimensions";
export const EMBED_MODEL = "openai/text-embedding-3-small";
export const EMBED_DIMENSIONS = 1536;
export const DEFAULT_CHAT_MODEL = "openai/gpt-oss-120b:free";
export const DEFAULT_LORE_MODEL = "openai/gpt-oss-20b:free";
export const MODEL_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/;

const model = z.string().min(1).max(200).regex(MODEL_ID_PATTERN);
const byokSchema = z.object({
  [HDR_OPENROUTER_KEY]: z.string().trim().min(1).max(512).regex(/^[\x21-\x7e]+$/),
  [HDR_CHAT_MODEL]: model,
  [HDR_LORE_MODEL]: model,
  [HDR_EMBED_MODEL]: z.literal(EMBED_MODEL),
  [HDR_EMBED_DIMENSIONS]: z.literal("1536"),
});

export type ByokHeaders = z.infer<typeof byokSchema>;

export function buildByokHeaders(config: ByokConfig): ByokHeaders {
  const headers = byokSchema.safeParse({
    [HDR_OPENROUTER_KEY]: config.openrouterKey,
    [HDR_CHAT_MODEL]: config.chatModel.trim() || DEFAULT_CHAT_MODEL,
    [HDR_LORE_MODEL]: config.loreModel.trim() || DEFAULT_LORE_MODEL,
    [HDR_EMBED_MODEL]: EMBED_MODEL,
    [HDR_EMBED_DIMENSIONS]: String(EMBED_DIMENSIONS),
  });
  if (!headers.success) throw new Error("Your API key or a model name has unsupported characters. Check Settings.");
  return headers.data;
}

export function readByokHeaders(headers: Headers): ByokHeaders {
  const parsed = byokSchema.safeParse(Object.fromEntries(
    Object.keys(byokSchema.shape).map((key) => [key, headers.get(key)]),
  ));
  if (!parsed.success) throw new Error("Invalid provider settings");
  return parsed.data;
}
