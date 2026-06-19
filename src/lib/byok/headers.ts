import type { ByokConfig } from "@/types/echolore";

/**
 * BYOK header helpers.
 *
 * The client reads the OpenRouter + Jina keys from localStorage (zustand-persist)
 * and attaches them per-request via these headers. The server-side route handler
 * reads the headers and uses them with the Vercel AI SDK (OpenRouter) and the
 * Jina REST API (embeddings). Keys are NEVER persisted server-side, NEVER logged,
 * and NEVER stored in the database.
 */

export const HDR_USER_ID           = "x-user-id";
export const HDR_OPENROUTER_KEY    = "x-openrouter-key";
export const HDR_JINA_KEY          = "x-jina-key";
export const HDR_CHAT_MODEL        = "x-chat-model";
export const HDR_LORE_MODEL        = "x-lore-model";
export const HDR_EMBED_MODEL       = "x-embed-model";
export const HDR_EMBED_DIMENSIONS  = "x-embed-dimensions";

export interface ByokHeaders {
  [HDR_USER_ID]: string;
  [HDR_OPENROUTER_KEY]: string;
  [HDR_JINA_KEY]: string;
  [HDR_CHAT_MODEL]: string;
  [HDR_LORE_MODEL]: string;
  [HDR_EMBED_MODEL]: string;
  [HDR_EMBED_DIMENSIONS]: string;
}

/** Build the headers object for a fetch() call from the persisted BYOK config. */
export function buildByokHeaders(userId: string, config: ByokConfig): ByokHeaders {
  if (!config.openrouterKey.trim()) {
    throw new Error(
      "No OpenRouter API key configured. Open Settings (top-right) and paste your key.",
    );
  }
  if (!config.jinaKey.trim()) {
    throw new Error(
      "No Jina API key configured. Open Settings and paste your Jina key (used for embeddings).",
    );
  }
  return {
    [HDR_USER_ID]: userId,
    [HDR_OPENROUTER_KEY]: config.openrouterKey.trim(),
    [HDR_JINA_KEY]: config.jinaKey.trim(),
    [HDR_CHAT_MODEL]: config.chatModel,
    [HDR_LORE_MODEL]: config.loreModel,
    [HDR_EMBED_MODEL]: config.embedModel,
    [HDR_EMBED_DIMENSIONS]: String(config.embedDimensions),
  };
}

/** Read & validate BYOK headers on the server. Throws if anything is missing. */
export function readByokHeaders(headers: Headers): ByokHeaders {
  const userId = headers.get(HDR_USER_ID);
  const openrouterKey = headers.get(HDR_OPENROUTER_KEY);
  const jinaKey = headers.get(HDR_JINA_KEY);
  const chatModel = headers.get(HDR_CHAT_MODEL);
  const loreModel = headers.get(HDR_LORE_MODEL);
  const embedModel = headers.get(HDR_EMBED_MODEL);
  const embedDimensions = headers.get(HDR_EMBED_DIMENSIONS);

  if (!userId)            throw new Error("Missing x-user-id header");
  if (!openrouterKey)     throw new Error("Missing OpenRouter API key (open Settings to add one)");
  if (!jinaKey)           throw new Error("Missing Jina API key (open Settings to add one for embeddings)");
  if (!chatModel)         throw new Error("Missing x-chat-model header");
  if (!loreModel)         throw new Error("Missing x-lore-model header");
  if (!embedModel)        throw new Error("Missing x-embed-model header");
  if (!embedDimensions)   throw new Error("Missing x-embed-dimensions header");

  return {
    [HDR_USER_ID]: userId,
    [HDR_OPENROUTER_KEY]: openrouterKey,
    [HDR_JINA_KEY]: jinaKey,
    [HDR_CHAT_MODEL]: chatModel,
    [HDR_LORE_MODEL]: loreModel,
    [HDR_EMBED_MODEL]: embedModel,
    [HDR_EMBED_DIMENSIONS]: embedDimensions,
  };
}
