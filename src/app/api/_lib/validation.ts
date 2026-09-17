import { z } from "zod";

export const uuidSchema = z.string().uuid();
export const MAX_MESSAGE_LENGTH = 16000;
export const MAX_BODY_BYTES = 131072;

export function isLoreState(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const pending: { value: unknown; depth: number }[] = [{ value, depth: 0 }];
  let nodes = 0;
  while (pending.length) {
    const current = pending.pop()!;
    if (++nodes > 512 || current.depth > 6) return false;
    const item = current.value;
    if (item === null || typeof item === "boolean") continue;
    if (typeof item === "number") {
      if (!Number.isFinite(item)) return false;
    } else if (typeof item === "string") {
      if (item.length > 4000 || item.includes("\0")) return false;
    } else if (typeof item === "object") {
      const entries = Object.entries(item);
      if (entries.length > 100) return false;
      for (const [key, child] of entries) {
        if (key.length > 100 || ["__proto__", "prototype", "constructor"].includes(key)) return false;
        pending.push({ value: child, depth: current.depth + 1 });
      }
    } else return false;
  }
  return JSON.stringify(value).length <= 16000;
}

export const loreStateSchema = z.custom<Record<string, unknown>>(isLoreState);
const text = (max: number) => z.string().trim().min(1).max(max).refine((value) => !value.includes("\0"));
export const campaignSchema = z.object({
  title: text(120),
  worldDescription: text(8000),
  userPersona: text(4000),
  aiPersona: text(4000),
  startingState: loreStateSchema.optional(),
}).strict();

export const chatSchema = z.object({
  campaignId: uuidSchema,
  message: text(MAX_MESSAGE_LENGTH).optional(),
  id: z.string().max(200).optional(),
  messageId: z.string().max(200).optional(),
  trigger: z.literal("submit-message").optional(),
  messages: z.array(z.object({
    id: z.string().max(200).optional(),
    role: z.enum(["user", "assistant", "system"]),
    content: z.string().max(MAX_MESSAGE_LENGTH).optional(),
    parts: z.array(z.object({
      type: z.string().max(100),
      text: z.string().max(MAX_MESSAGE_LENGTH).optional(),
    })).max(32).optional(),
  })).max(200).optional(),
}).strict().transform((body) => {
  const last = body.messages?.at(-1);
  const message = body.message ?? (last?.role === "user"
    ? last.parts?.filter((part) => part.type === "text").map((part) => part.text ?? "").join("").trim() || last.content?.trim()
    : undefined);
  return { campaignId: body.campaignId, message };
}).pipe(z.object({ campaignId: uuidSchema, message: text(MAX_MESSAGE_LENGTH) }));

export class RequestError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function readJson(req: Request): Promise<unknown> {
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new RequestError(415, "Expected JSON");
  }
  if (Number(req.headers.get("content-length")) > MAX_BODY_BYTES) throw new RequestError(413, "Request too large");
  const reader = req.body?.getReader();
  if (!reader) throw new RequestError(400, "Invalid request");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new RequestError(413, "Request too large");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError(400, "Invalid JSON");
  } finally {
    reader.releaseLock();
  }
}

export function errorResponse(error: unknown) {
  return Response.json({ error: error instanceof RequestError ? error.message : "Request failed" }, {
    status: error instanceof RequestError ? error.status : 500,
  });
}
