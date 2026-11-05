import { z } from "zod";

export const MAX_MESSAGE_LENGTH = 16000;
export const MAX_BODY_BYTES = 262144;

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

export const RESPONSE_LENGTHS = ["short", "medium", "long"] as const;
export type ResponseLength = (typeof RESPONSE_LENGTHS)[number];
export const chatOptionsSchema = z.object({
  responseLength: z.enum(RESPONSE_LENGTHS).optional(),
  creativity: z.number().finite().min(0).max(1.5).optional(),
}).strict();

const turn = z.object({ role: z.enum(["user", "assistant"]), content: text(MAX_MESSAGE_LENGTH) }).strict();

/** Everything the narrator needs for one reply. The browser owns the story; the server keeps nothing. */
export const chatSchema = z.object({
  world: z.object({ worldDescription: text(8000), userPersona: text(4000), aiPersona: text(4000) }).strict(),
  worldState: loreStateSchema,
  history: z.array(turn).max(40),
  memories: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().min(1).max(8000),
    similarity: z.number().finite().min(-1).max(1),
    createdAt: z.string().max(40).optional(),
  }).strict()).max(8),
  message: text(MAX_MESSAGE_LENGTH),
  options: chatOptionsSchema.optional(),
}).strict();

export const embedSchema = z.object({ texts: z.array(text(MAX_MESSAGE_LENGTH)).min(1).max(16) }).strict();

export const loreUpdateSchema = z.object({
  state: loreStateSchema,
  recent: z.array(turn).min(1).max(8),
}).strict();

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
