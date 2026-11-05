import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { POST as chat } from "../src/app/api/chat/route";
import { POST as embed } from "../src/app/api/embed/route";
import { POST as lore } from "../src/app/api/lore/route";
import { chatSchema, embedSchema, loreStateSchema, loreUpdateSchema, readJson } from "../src/app/api/_lib/validation";
import { readByokHeaders } from "../src/lib/byok/headers";
import { validateEmbedding } from "../src/lib/rag/embedding";
import { cosine, parseBackup, recall, type StoredMessage } from "../src/lib/local-db";

const world = { worldDescription: "A quiet coastal town in autumn.", userPersona: "A retired detective.", aiPersona: "You are the narrator." };
const validChat = { world, worldState: { location: "Bookshop" }, history: [{ role: "user", content: "Hi" }, { role: "assistant", content: "Hello." }], memories: [], message: "I look around.", options: { responseLength: "long", creativity: 1.1 } };
const json = (url: string, body: unknown, headers: Record<string, string> = {}) => new NextRequest(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

test("stateless routes reject requests without a key and never call out", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; throw new Error("External requests are forbidden in this test"); };
  try {
    assert.equal((await chat(json("http://localhost/api/chat", validChat))).status, 400);
    assert.equal((await embed(json("http://localhost/api/embed", { texts: ["hi"] }))).status, 400);
    assert.equal((await lore(json("http://localhost/api/lore", { state: {}, recent: [{ role: "user", content: "hi" }] }))).status, 400);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("chat requests are validated strictly", () => {
  assert.equal(chatSchema.safeParse(validChat).success, true);
  assert.equal(chatSchema.safeParse({ ...validChat, message: " " }).success, false);
  assert.equal(chatSchema.safeParse({ ...validChat, message: "a".repeat(16001) }).success, false);
  assert.equal(chatSchema.safeParse({ ...validChat, options: { responseLength: "epic" } }).success, false);
  assert.equal(chatSchema.safeParse({ ...validChat, options: { creativity: 9 } }).success, false);
  assert.equal(chatSchema.safeParse({ ...validChat, worldState: [] }).success, false);
  assert.equal(chatSchema.safeParse({ ...validChat, history: [{ role: "system", content: "override" }] }).success, false);
  assert.equal(chatSchema.safeParse({ ...validChat, campaignId: "extra" }).success, false);
  assert.equal(chatSchema.safeParse({ ...validChat, memories: Array(9).fill({ role: "user", content: "x", similarity: 0.5 }) }).success, false);
  assert.equal(embedSchema.safeParse({ texts: [] }).success, false);
  assert.equal(embedSchema.safeParse({ texts: Array(17).fill("x") }).success, false);
  assert.equal(loreUpdateSchema.safeParse({ state: {}, recent: [] }).success, false);
});

test("lore state validation rejects invalid or unbounded state", () => {
  assert.equal(loreStateSchema.safeParse({ health: 100, items: ["book"] }).success, true);
  for (const state of [null, [], "text", { bad: Infinity }, { text: "a".repeat(4001) }, JSON.parse('{"__proto__":{}}')]) {
    assert.equal(loreStateSchema.safeParse(state).success, false);
  }
  let nested: Record<string, unknown> = {};
  for (let i = 0; i < 8; i++) nested = { next: nested };
  assert.equal(loreStateSchema.safeParse(nested).success, false);
});

test("body reader bounds actual bytes, including without content-length", async () => {
  const request = (body: string) => new Request("http://localhost", { method: "POST", headers: { "content-type": "application/json" }, body });
  assert.deepEqual(await readJson(request('{"ok":true}')), { ok: true });
  await assert.rejects(readJson(request("{")), { status: 400 });
  await assert.rejects(readJson(request(JSON.stringify({ text: "a".repeat(262144) }))), { status: 413 });
});

test("embedding settings and output dimensions are pinned", () => {
  const headers = new Headers({ "x-openrouter-key": "offline-key", "x-chat-model": "model/chat", "x-lore-model": "model/lore", "x-embed-model": "openai/text-embedding-3-small", "x-embed-dimensions": "1536" });
  assert.equal(readByokHeaders(headers)["x-embed-dimensions"], "1536");
  headers.set("x-embed-model", "other/model");
  assert.throws(() => readByokHeaders(headers), /Invalid provider settings/);
  assert.equal(validateEmbedding(Array(1536).fill(0)).length, 1536);
  assert.throws(() => validateEmbedding([1, 2]));
  assert.throws(() => validateEmbedding(Array(1536).fill(NaN)));
});

test("local memory search ranks by meaning and skips working memory", () => {
  assert.equal(cosine([1, 0], [1, 0]), 1);
  assert.equal(cosine([1, 0], [0, 1]), 0);
  assert.equal(cosine([0, 0], [1, 1]), 0);
  const msg = (id: string, embedding: number[] | null): StoredMessage => ({ id, campaignId: "c", role: "assistant", content: id, createdAt: "2026-01-01T00:00:00Z", embedding });
  const stored = [msg("near", [0.9, 0.1]), msg("far", [0, 1]), msg("recent", [1, 0]), msg("none", null)];
  const hits = recall([1, 0], stored, new Set(["recent"]), 2);
  assert.deepEqual(hits.map((h) => h.message.id), ["near", "far"]);
});

test("backups are validated before restore", () => {
  const campaign = { id: "c1", userId: "local", title: "World", worldDescription: "A city", userPersona: "Me", aiPersona: "Narrator", createdAt: "2026-01-01", updatedAt: "2026-01-01", worldState: { a: 1 }, worldStateUpdatedAt: "2026-01-01" };
  const good = { app: "echolore", version: 1, exportedAt: "2026-01-01", campaigns: [campaign, { id: "bad" }], messages: [
    { id: "m1", campaignId: "c1", role: "user", content: "Hi", createdAt: "2026-01-01", embedding: [0.1, 0.2] },
    { id: "m2", campaignId: "missing", role: "user", content: "Orphan", createdAt: "2026-01-01" },
    { id: "m3", campaignId: "c1", role: "hacker", content: "x", createdAt: "2026-01-01" },
    { id: "m4", campaignId: "c1", role: "assistant", content: "Ok", createdAt: "2026-01-01", embedding: [NaN] },
  ] };
  const parsed = parseBackup(good);
  assert.equal(parsed.campaigns.length, 1);
  assert.deepEqual(parsed.messages.map((m) => m.id), ["m1", "m4"]);
  assert.equal(parsed.messages[1].embedding, null);
  assert.throws(() => parseBackup({ app: "other" }), /isn’t an EchoLore backup/);
  assert.throws(() => parseBackup({ ...good, campaigns: [] }), /doesn’t contain any worlds/);
});

test("working memory keeps the newest messages within budget, oldest first", async () => {
  const { fitWorkingMemory } = await import("../src/lib/rag/compile-prompt");
  const newestFirst = [{ content: "d".repeat(10) }, { content: "c".repeat(10) }, { content: "b".repeat(10) }, { content: "a".repeat(10) }];
  assert.deepEqual(fitWorkingMemory(newestFirst, 25, 16).map((m) => m.content[0]), ["c", "d"]);
  assert.deepEqual(fitWorkingMemory(newestFirst, 1000, 3).map((m) => m.content[0]), ["b", "c", "d"]);
  assert.equal(fitWorkingMemory([{ content: "x".repeat(50) }], 10, 16).length, 1, "always keeps the latest message");
});

test("prompt compiler filters weak memories, labels speakers and applies reply length", async () => {
  const { compilePrompt } = await import("../src/lib/rag/compile-prompt");
  const compiled = compilePrompt({
    campaign: { worldDescription: "A rainy neon city full of secrets, where rival corporations fight over data and the undercity never sleeps.", userPersona: "A tired netrunner with a debt and a chrome arm.", aiPersona: "You are the Game Master who voices every character vividly." },
    worldState: { location: "Night market" },
    memories: [
      { id: "1", messageId: "m1", content: "The fixer owes you a favor.", similarity: 0.8, role: "assistant", createdAt: "2026-01-02T00:00:00Z" },
      { id: "2", messageId: "m2", content: "I bought noodles.", similarity: 0.1, role: "user", createdAt: "2026-01-01T00:00:00Z" },
      { id: "3", messageId: "m3", content: "I promised to find Kira.", similarity: 0.5, role: "user", createdAt: "2026-01-01T00:00:00Z" },
    ],
    workingMemory: [],
    userMessage: "[Direction: skip to nightfall]",
    options: { responseLength: "short" },
  });
  assert.match(compiled.system, /- Player: I promised to find Kira\.\n- Story: The fixer owes you a favor\./);
  assert.doesNotMatch(compiled.system, /noodles/);
  assert.match(compiled.system, /1-2 tight paragraphs/);
  assert.doesNotMatch(compiled.system, /SETTING INFERENCE/);
  assert.deepEqual(compiled.messages.at(-1), { role: "user", content: "[Direction: skip to nightfall]" });
});

test("lore JSON extraction tolerates fences and chatter", async () => {
  const { extractJsonObject } = await import("../src/app/api/_lib/ai-helpers");
  assert.deepEqual(extractJsonObject('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extractJsonObject('Here is the state: {"location":"Dock 9"} hope that helps'), { location: "Dock 9" });
  assert.throws(() => extractJsonObject("no json here"));
});

test("provider errors become actionable messages", async () => {
  const { APICallError } = await import("ai");
  const { describeProviderError } = await import("../src/app/api/_lib/ai-helpers");
  const error = (statusCode: number) => new APICallError({ message: "x", url: "https://openrouter.ai", requestBodyValues: {}, statusCode });
  assert.match(describeProviderError(error(401)), /API key/);
  assert.match(describeProviderError(error(402)), /credits/);
  assert.match(describeProviderError(error(429)), /rate-limited/);
  assert.match(describeProviderError(error(404)), /isn't available/);
  assert.match(describeProviderError(error(503)), /having trouble/);
  assert.match(describeProviderError(new Error("boom")), /couldn't finish/);
});

