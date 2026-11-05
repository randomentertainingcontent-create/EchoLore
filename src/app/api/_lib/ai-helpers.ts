import { APICallError } from "ai";

/** Turn provider failures into messages a player can act on. Never leaks keys or bodies. */
export function describeProviderError(error: unknown): string {
  const status = APICallError.isInstance(error) ? error.statusCode : undefined;
  const text = error instanceof Error ? error.message.toLowerCase() : "";
  if (status === 401 || text.includes("no auth credentials") || text.includes("invalid api key")) {
    return "OpenRouter rejected your API key. Open API settings and check the key.";
  }
  if (status === 402 || text.includes("insufficient credits") || text.includes("credits")) {
    return "Your OpenRouter account is out of credits for this model. Add credits or pick a free model in API settings.";
  }
  if (status === 403) return "OpenRouter's moderation blocked this request. Try rephrasing, or choose a different model.";
  if (status === 404 || text.includes("no endpoints found") || text.includes("not a valid model")) {
    return "That model isn't available on OpenRouter. Pick another model in API settings.";
  }
  if (status === 429 || text.includes("rate limit") || text.includes("rate-limited")) {
    return "The model is rate-limited right now (common with free models). Wait a moment and try again, or switch models.";
  }
  if (status === 408 || text.includes("timeout") || text.includes("aborted")) {
    return "The model took too long to answer. Try again, or pick a faster model.";
  }
  if (status && status >= 500) return "The model provider is having trouble. Try again in a moment, or switch models.";
  return "The narrator couldn't finish that reply. Try again in a moment.";
}

/** Pull the first JSON object out of a model reply (tolerates fences or chatter). */
export function extractJsonObject(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try { return JSON.parse(cleaned); } catch {}
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("No JSON object");
  return JSON.parse(cleaned.slice(start, end + 1));
}

