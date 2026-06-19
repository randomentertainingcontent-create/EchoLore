import type { ByokConfig, LlmProvider } from "@/types/echolore";

/**
 * BYOK header helpers.
 *
 * The client reads keys from localStorage (zustand-persist) and attaches them
 * per-request via these headers. The server-side route handler reads the
 * headers and uses them with the Vercel AI SDK. Keys are NEVER persisted
 * server-side, NEVER logged, and NEVER stored in the database.
 */

export const HDR_USER_ID  = "x-user-id";
export const HDR_API_KEY  = "x-user-api-key";
export const HDR_PROVIDER = "x-llm-provider";
export const HDR_CHAT_MODEL = "x-chat-model";
export const HDR_LORE_MODEL = "x-lore-model";
export const HDR_EMBED_MODEL = "x-embed-model";

export interface ByokHeaders {
  [HDR_USER_ID]: string;
  [HDR_API_KEY]: string;
  [HDR_PROVIDER]: LlmProvider;
  [HDR_CHAT_MODEL]: string;
  [HDR_LORE_MODEL]: string;
  [HDR_EMBED_MODEL]: string;
}

/** Build the headers object for a fetch() call from the persisted BYOK config. */
export function buildByokHeaders(
  userId: string,
  config: ByokConfig,
): ByokHeaders {
  const key = config.keys[config.provider];
  if (!key) {
    throw new Error(
      `No API key configured for provider "${config.provider}". ` +
      `Open Settings (top-right) and paste your ${config.provider} key.`,
    );
  }
  return {
    [HDR_USER_ID]: userId,
    [HDR_API_KEY]: key,
    [HDR_PROVIDER]: config.provider,
    [HDR_CHAT_MODEL]: config.chatModel,
    [HDR_LORE_MODEL]: config.loreModel,
    [HDR_EMBED_MODEL]: config.embedModel,
  };
}

/** Read & validate BYOK headers on the server. Throws if anything is missing. */
export function readByokHeaders(headers: Headers): ByokHeaders {
  const userId = headers.get(HDR_USER_ID);
  const apiKey = headers.get(HDR_API_KEY);
  const provider = headers.get(HDR_PROVIDER) as LlmProvider | null;
  const chatModel = headers.get(HDR_CHAT_MODEL);
  const loreModel = headers.get(HDR_LORE_MODEL);
  const embedModel = headers.get(HDR_EMBED_MODEL);

  if (!userId) throw new Error("Missing x-user-id header");
  if (!apiKey) throw new Error("Missing x-user-api-key header (open Settings to add one)");
  if (!provider || !["gemini", "openai", "anthropic"].includes(provider)) {
    throw new Error("Invalid or missing x-llm-provider header");
  }
  if (!chatModel) throw new Error("Missing x-chat-model header");
  if (!loreModel) throw new Error("Missing x-lore-model header");
  if (!embedModel) throw new Error("Missing x-embed-model header");

  return { [HDR_USER_ID]: userId, [HDR_API_KEY]: apiKey, [HDR_PROVIDER]: provider,
           [HDR_CHAT_MODEL]: chatModel, [HDR_LORE_MODEL]: loreModel, [HDR_EMBED_MODEL]: embedModel };
}
