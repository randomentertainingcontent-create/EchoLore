import { NextRequest } from "next/server";
import { streamText } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { readByokHeaders } from "@/lib/byok/headers";
import { compilePrompt, LENGTH_GUIDE } from "@/lib/rag/compile-prompt";
import { describeProviderError } from "../_lib/ai-helpers";
import { chatSchema, errorResponse, readJson, RequestError } from "../_lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

/**
 * Stateless narration. The browser sends the world, the lorebook, recent
 * messages and recalled memories; this route compiles the prompt and streams
 * the reply from OpenRouter using the player's own key. Nothing is stored.
 */
export async function POST(req: NextRequest) {
  try {
    let headers: ReturnType<typeof readByokHeaders>;
    try { headers = readByokHeaders(req.headers); }
    catch { throw new RequestError(400, "Add a valid OpenRouter key in Settings."); }
    const parsed = chatSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new RequestError(400, "Invalid chat request");
    const { world, worldState, history, memories, message, options = {} } = parsed.data;

    // Some providers require the conversation to open with a user turn.
    let working = history;
    while (working.length > 0 && working[0].role !== "user") working = working.slice(1);

    const compiled = compilePrompt({
      campaign: world,
      worldState,
      memories: memories.map((m, i) => ({ id: String(i), messageId: String(i), content: m.content, similarity: m.similarity, role: m.role, createdAt: m.createdAt })),
      workingMemory: working.map((m, i) => ({ id: String(i), campaignId: "", role: m.role, content: m.content, createdAt: "" })),
      userMessage: message,
      options: { responseLength: options.responseLength },
    });

    const openrouter = createOpenRouter({ apiKey: headers["x-openrouter-key"] });
    const result = streamText({
      model: openrouter(headers["x-chat-model"], { reasoning: { exclude: true, effort: "low" } }),
      system: compiled.system,
      messages: compiled.messages,
      temperature: options.creativity ?? 0.85,
      maxOutputTokens: LENGTH_GUIDE[options.responseLength ?? "medium"].tokens,
      maxRetries: 1,
      abortSignal: AbortSignal.any([AbortSignal.timeout(160000), req.signal]),
    });
    return result.toUIMessageStreamResponse({ sendReasoning: false, onError: describeProviderError });
  } catch (error) {
    return errorResponse(error);
  }
}
