import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { GET, POST } from "../src/app/api/campaigns/route";
import { POST as chat } from "../src/app/api/chat/route";
import { requireUserId } from "../src/lib/auth";
import { getRequestSupabase } from "../src/lib/supabase";
import { campaignSchema, chatSchema, loreStateSchema, readJson } from "../src/app/api/_lib/validation";
import { readByokHeaders } from "../src/lib/byok/headers";
import { validateEmbedding } from "../src/lib/rag/embedding";

test("campaigns reject a spoofed x-user-id without contacting Supabase", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    throw new Error("External requests are forbidden in this test");
  };
  try {
    const response = await GET(new NextRequest("http://localhost/api/campaigns", {
      headers: { "x-user-id": "00000000-0000-4000-8000-000000000001" },
    }));
    assert.equal(response.status, 401);
    assert.equal(calls, 0);
    assert.equal((await GET(new NextRequest("http://localhost/api/campaigns"))).status, 401);
    assert.equal((await POST(new NextRequest("http://localhost/api/campaigns", { method: "POST" }))).status, 401);
    assert.equal((await chat(new NextRequest("http://localhost/api/chat", { method: "POST" }))).status, 401);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("verified identity and request client use bearer token and anon key", async () => {
  const originalFetch = globalThis.fetch;
  const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const oldKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.invalid";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  const userId = "00000000-0000-4000-8000-000000000001";
  const calls: { url: string; authorization: string | null; key: string | null }[] = [];
  globalThis.fetch = async (input, init) => {
    const headers = new Headers(init?.headers);
    calls.push({ url: String(input), authorization: headers.get("authorization"), key: headers.get("apikey") });
    if (String(input).includes("/auth/v1/user")) {
      return Response.json({ id: userId, aud: "authenticated", role: "authenticated", email: "offline@example.test", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" });
    }
    return Response.json([]);
  };
  try {
    const request = new NextRequest("http://localhost/api/campaigns", {
      headers: { authorization: "Bearer offline.token", "x-user-id": "untrusted" },
    });
    assert.equal(await requireUserId(request), userId);
    const client = getRequestSupabase(request);
    assert.equal(client, getRequestSupabase(request));
    assert.notEqual(client, getRequestSupabase(new Request(request)));
    await client.from("campaigns").select("id");
    assert.equal(calls.length, 2);
    assert.ok(calls.every((call) => call.authorization === "Bearer offline.token" && call.key === "test-anon-key"));
    globalThis.fetch = async () => Response.json({ message: "invalid token" }, { status: 401 });
    assert.equal(await requireUserId(new Request(request)), null);
  } finally {
    globalThis.fetch = originalFetch;
    if (oldUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = oldKey;
  }
});

test("campaign and lore validation reject invalid or unbounded state before writes", () => {
  const valid = { title: "World", worldDescription: "Modern city", userPersona: "Student", aiPersona: "Friend", startingState: { health: 100, items: ["book"] } };
  assert.equal(campaignSchema.safeParse(valid).success, true);
  for (const startingState of [null, [], "text", { bad: Infinity }, { text: "a".repeat(4001) }, JSON.parse('{"__proto__":{}}')]) {
    assert.equal(campaignSchema.safeParse({ ...valid, startingState }).success, false);
  }
  assert.equal(campaignSchema.safeParse({ ...valid, title: "a".repeat(121) }).success, false);
  let nested: Record<string, unknown> = {};
  for (let i = 0; i < 8; i++) nested = { next: nested };
  assert.equal(loreStateSchema.safeParse(nested).success, false);
});

test("chat rejects regeneration, invalid UUIDs and oversized inputs", () => {
  const campaignId = "00000000-0000-4000-8000-000000000001";
  assert.equal(chatSchema.safeParse({ campaignId, message: "Hello" }).success, true);
  assert.equal(chatSchema.safeParse({ campaignId, message: "Hello", trigger: "regenerate-message" }).success, false);
  assert.equal(chatSchema.safeParse({ campaignId: "bad", message: "Hello" }).success, false);
  assert.equal(chatSchema.safeParse({ campaignId, message: "a".repeat(16001) }).success, false);
  assert.equal(chatSchema.safeParse({ campaignId, messages: [{ role: "assistant", content: "old reply" }] }).success, false);
  assert.deepEqual(chatSchema.parse({ campaignId, trigger: "submit-message", messages: [{ role: "user", parts: [{ type: "text", text: "Hello" }] }] }), { campaignId, message: "Hello", options: {} });
  assert.deepEqual(chatSchema.parse({ campaignId, message: "Hi", options: { responseLength: "long", creativity: 1.1 } }).options, { responseLength: "long", creativity: 1.1 });
  assert.equal(chatSchema.safeParse({ campaignId, message: "Hi", options: { responseLength: "epic" } }).success, false);
  assert.equal(chatSchema.safeParse({ campaignId, message: "Hi", options: { creativity: 9 } }).success, false);
});

test("body reader bounds actual bytes, including without content-length", async () => {
  const request = (body: string) => new Request("http://localhost", { method: "POST", headers: { "content-type": "application/json" }, body });
  assert.deepEqual(await readJson(request('{"ok":true}')), { ok: true });
  await assert.rejects(readJson(request("{")), { status: 400 });
  await assert.rejects(readJson(request(JSON.stringify({ text: "a".repeat(131072) }))), { status: 413 });
});

test("creation reports a missing database migration without leaking database details", async () => {
  const originalFetch = globalThis.fetch;
  const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const oldKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.invalid";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  globalThis.fetch = async (input) => {
    if (String(input).endsWith("/auth/v1/user")) {
      return Response.json({ id: "00000000-0000-4000-8000-000000000001", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {} });
    }
    assert.ok(String(input).endsWith("/rest/v1/rpc/create_campaign"));
    return Response.json({ code: "PGRST202", message: "private database diagnostic", details: "private details" }, { status: 404 });
  };
  try {
    const response = await POST(new NextRequest("http://localhost/api/campaigns", {
      method: "POST",
      headers: { authorization: "Bearer offline.token", "content-type": "application/json" },
      body: JSON.stringify({ title: "World", worldDescription: "A quiet city", userPersona: "A traveler", aiPersona: "A narrator" }),
    }));
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "Database setup is incomplete. Ask the app administrator to apply supabase/schema.sql for a new database, then supabase/hardening.sql. Your world has not been created." });
  } finally {
    globalThis.fetch = originalFetch;
    if (oldUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = oldKey;
  }
});

test("creation handler contract with isolated database responses", async (t) => {
  const originalFetch = globalThis.fetch;
  const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const oldKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.invalid";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  const userId = "00000000-0000-4000-8000-000000000001";
  const input = { title: " World ", worldDescription: "A quiet city", userPersona: "A traveler", aiPersona: "A narrator" };
  const row = { id: "00000000-0000-4000-8000-000000000002", user_id: userId, title: "World", world_description: input.worldDescription, user_persona: input.userPersona, ai_persona: input.aiPersona, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" };
  let rpcResponse = () => Response.json(row);
  let calls: unknown[] = [];
  globalThis.fetch = async (url, init) => {
    assert.equal(new URL(String(url)).origin, "https://supabase.invalid");
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer offline.token");
    if (String(url).endsWith("/auth/v1/user")) {
      return Response.json({ id: userId, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {} });
    }
    assert.ok(String(url).endsWith("/rest/v1/rpc/create_campaign"));
    assert.equal(init?.method, "POST");
    calls.push(JSON.parse(String(init?.body)));
    return rpcResponse();
  };
  const create = (body: unknown) => POST(new NextRequest("http://localhost/api/campaigns", {
    method: "POST",
    headers: { authorization: "Bearer offline.token", "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
  try {
    await t.test("success maps the database row and returns the starting lorebook", async () => {
      const startingState = { location: "City gates", inventory: ["map"] };
      const response = await create({ ...input, startingState });
      assert.equal(response.status, 201);
      assert.deepEqual(await response.json(), { campaign: {
        id: row.id, userId, title: "World", worldDescription: row.world_description,
        userPersona: row.user_persona, aiPersona: row.ai_persona,
        createdAt: row.created_at, updatedAt: row.updated_at, worldState: { stateJson: startingState },
      } });
      assert.deepEqual(calls, [{ p_title: "World", p_world_description: input.worldDescription, p_user_persona: input.userPersona, p_ai_persona: input.aiPersona, p_starting_state: startingState }]);
    });
    await t.test("omitting starting state sends an empty object", async () => {
      calls = [];
      const response = await create(input);
      assert.equal(response.status, 201);
      assert.deepEqual((await response.json()).campaign.worldState, { stateJson: {} });
      assert.equal(calls.length, 1);
      assert.deepEqual((calls[0] as Record<string, unknown>).p_starting_state, {});
    });
    await t.test("invalid inputs never call the creation RPC", async () => {
      calls = [];
      for (const body of [{ ...input, title: " " }, { ...input, startingState: [] }, { ...input, startingState: { note: "x".repeat(4001) } }]) {
        assert.equal((await create(body)).status, 400);
      }
      assert.equal(calls.length, 0);
    });
    for (const failure of [{ code: "42501", status: 403, message: /permissions/ }, { code: "23503", status: 409, message: /account/ }, { code: "08006", status: 503, message: /database may be unavailable/ }]) {
      await t.test(`database failure ${failure.code} gives a safe actionable response`, async () => {
        calls = [];
        rpcResponse = () => Response.json({ code: failure.code, message: "private database diagnostic" }, { status: 400 });
        const response = await create(input);
        assert.equal(response.status, failure.status);
        const body = await response.json();
        assert.match(body.error, failure.message);
        assert.doesNotMatch(body.error, /private database diagnostic/);
        assert.equal(calls.length, 1);
      });
    }
    await t.test("empty database result never reports successful creation", async () => {
      rpcResponse = () => Response.json(null);
      const response = await create(input);
      assert.equal(response.status, 503);
      assert.match((await response.json()).error, /Refresh your worlds/);
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (oldUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = oldKey;
  }
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

test("new route schemas bound edits and lore replacement", async () => {
  const { campaignPatchSchema, messageEditSchema, lorePutSchema } = await import("../src/app/api/_lib/validation");
  assert.equal(campaignPatchSchema.safeParse({}).success, false);
  assert.equal(campaignPatchSchema.safeParse({ title: "New" }).success, true);
  assert.equal(campaignPatchSchema.safeParse({ title: " " }).success, false);
  assert.equal(campaignPatchSchema.safeParse({ userId: "x" }).success, false);
  assert.equal(messageEditSchema.safeParse({ messageId: "00000000-0000-4000-8000-000000000001", content: "Hi" }).success, true);
  assert.equal(messageEditSchema.safeParse({ messageId: "bad", content: "Hi" }).success, false);
  assert.equal(lorePutSchema.safeParse({ state: { a: 1 } }).success, true);
  assert.equal(lorePutSchema.safeParse({ state: [1] }).success, false);
});
