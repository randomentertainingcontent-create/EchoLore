import { expect, test as base, type Page } from "@playwright/test";
import type { Campaign, Message } from "../../src/types/echolore";

export const fakeKey = "sk-or-v1-local-test-not-a-real-key";
export const reply = "The lantern flickers. A silver path opens through the forest.";
const userId = "11111111-1111-4111-8111-111111111111";
const user = {
  id: userId,
  aud: "authenticated",
  role: "authenticated",
  email: "",
  is_anonymous: true,
  app_metadata: { provider: "anonymous", providers: ["anonymous"] },
  user_metadata: {},
  created_at: "2026-01-01T00:00:00.000Z",
};
const accessToken = `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: userId, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.local-test-signature`;

export type MockState = {
  campaigns: (Campaign & { worldState: { stateJson: unknown } })[];
  messages: Record<string, Message[]>;
  failChat: boolean;
  failHistory: boolean;
  failCreate: boolean;
  requests: string[];
  chatBodies: { campaignId: string; message: string }[];
  blocked: string[];
  idCounter: number;
};

export const test = base.extend<{ mock: MockState }>({
  mock: [async ({ context }, use) => {
    const state: MockState = { campaigns: [], messages: {}, failChat: false, failHistory: false, failCreate: false, requests: [], chatBodies: [], blocked: [], idCounter: 0 };
    await context.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const method = request.method();
      const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
      if (url.origin === "http://127.0.0.1:54321" && url.pathname.startsWith("/auth/v1/")) {
        if (method === "OPTIONS") {
          await route.fulfill({ status: 204, headers: { "access-control-allow-origin": "http://127.0.0.1:3100", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,OPTIONS" } });
          return;
        }
        state.requests.push(`${method} ${url.pathname}`);
        if (url.pathname === "/auth/v1/signup" || url.pathname === "/auth/v1/token") {
          await json({ access_token: accessToken, refresh_token: "local-test-refresh-token", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user });
          return;
        }
        if (url.pathname === "/auth/v1/user" || url.pathname === "/auth/v1/logout") {
          expect(request.headers().authorization).toMatch(/^Bearer \S+$/);
          await json(url.pathname.endsWith("user") ? user : {});
          return;
        }
      }
      if (url.origin === "http://127.0.0.1:3100" && url.pathname.startsWith("/api/")) {
        expect(request.headers().authorization).toMatch(/^Bearer \S+$/);
        state.requests.push(`${method} ${url.pathname}`);
        if (url.pathname === "/api/campaigns" && method === "GET") {
          await json({ campaigns: state.campaigns });
          return;
        }
        if (url.pathname === "/api/campaigns" && method === "POST") {
          if (state.failCreate) { await json({ error: "Mock save unavailable" }, 503); return; }
          const input = request.postDataJSON();
          const campaign = { ...input, id: `22222222-2222-4222-8222-${String(state.campaigns.length + 1).padStart(12, "0")}`, userId, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", worldState: { stateJson: input.startingState ?? {} } };
          state.campaigns.push(campaign);
          state.messages[campaign.id] = [];
          await json({ campaign }, 201);
          return;
        }
        if (url.pathname.startsWith("/api/campaigns/") && method === "GET") {
          const campaign = state.campaigns.find((item) => item.id === url.pathname.split("/").at(-1));
          expect(campaign).toBeDefined();
          await json({ campaign });
          return;
        }
        if (url.pathname.startsWith("/api/messages/") && method === "GET") {
          if (state.failHistory) { await json({ error: "Mock history unavailable" }, 503); return; }
          await json({ messages: state.messages[url.pathname.split("/").at(-1)!] ?? [] });
          return;
        }
        if (url.pathname.startsWith("/api/messages/") && method === "DELETE") {
          const list = state.messages[url.pathname.split("/").at(-1)!] ?? [];
          const index = list.findIndex((m) => m.id === url.searchParams.get("from"));
          expect(index).toBeGreaterThanOrEqual(0);
          const removed = list.splice(index);
          await json({ deleted: removed.length });
          return;
        }
        if (url.pathname.startsWith("/api/messages/") && method === "PATCH") {
          const body = request.postDataJSON();
          const message = (state.messages[url.pathname.split("/").at(-1)!] ?? []).find((m) => m.id === body.messageId);
          expect(message).toBeDefined();
          message!.content = body.content;
          await json({ message });
          return;
        }
        if (url.pathname.startsWith("/api/lorebook/") && method === "PUT") {
          const campaign = state.campaigns.find((item) => item.id === url.pathname.split("/").at(-1));
          expect(campaign).toBeDefined();
          campaign!.worldState = { stateJson: request.postDataJSON().state };
          await json({ state: campaign!.worldState.stateJson, updatedAt: new Date().toISOString() });
          return;
        }
        if (url.pathname.startsWith("/api/campaigns/") && method === "PATCH") {
          const campaign = state.campaigns.find((item) => item.id === url.pathname.split("/").at(-1));
          expect(campaign).toBeDefined();
          Object.assign(campaign!, request.postDataJSON(), { updatedAt: new Date().toISOString() });
          const { worldState: _ignored, ...plain } = campaign!;
          await json({ campaign: plain });
          return;
        }
        if (url.pathname === "/api/models" && method === "GET") {
          await json({ models: [
            { id: "openai/gpt-oss-120b:free", name: "OpenAI: gpt-oss-120b (free)", contextLength: 131072, promptPrice: 0, completionPrice: 0, free: true },
            { id: "anthropic/claude-test", name: "Anthropic: Claude Test", contextLength: 200000, promptPrice: 3, completionPrice: 15, free: false },
          ] });
          return;
        }
        if (url.pathname === "/api/key-check" && method === "POST") {
          expect(request.headers()["x-openrouter-key"]).toBe(fakeKey);
          await json({ ok: true, label: "local test", usage: 0.12, limit: null, limitRemaining: null, freeTier: true });
          return;
        }
        if (url.pathname === "/api/chat" && method === "POST") {
          expect(request.headers()["x-openrouter-key"]).toBe(fakeKey);
          const body = request.postDataJSON();
          expect(body).toEqual({ campaignId: expect.any(String), message: expect.any(String), options: { responseLength: expect.any(String), creativity: expect.any(Number) } });
          state.chatBodies.push({ campaignId: body.campaignId, message: body.message });
          if (state.failChat) { await json({ error: "Mock narrator unavailable" }, 503); return; }
          const id = `reply-${state.chatBodies.length}`;
          const nextId = () => `33333333-3333-4333-8333-${String(++state.idCounter).padStart(12, "0")}`;
          state.messages[body.campaignId].push(
            { id: nextId(), campaignId: body.campaignId, role: "user", content: body.message, createdAt: new Date().toISOString() },
            { id: nextId(), campaignId: body.campaignId, role: "assistant", content: reply, createdAt: new Date().toISOString() },
          );
          const events = [
            { type: "start", messageId: id },
            { type: "start-step" },
            { type: "text-start", id: "text-1" },
            { type: "text-delta", id: "text-1", delta: "The lantern flickers." },
            { type: "text-delta", id: "text-1", delta: " A silver path opens through the forest." },
            { type: "text-end", id: "text-1" },
            { type: "finish-step" },
            { type: "finish", finishReason: "stop" },
          ];
          await route.fulfill({ contentType: "text/event-stream", headers: { "x-vercel-ai-ui-message-stream": "v1", "cache-control": "no-cache" }, body: events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") + "data: [DONE]\n\n" });
          return;
        }
      }
      if (url.origin === "http://127.0.0.1:3100" && !url.pathname.startsWith("/api/")) {
        await route.continue();
        return;
      }
      state.blocked.push(`${method} ${url.origin}${url.pathname}`);
      await route.abort("blockedbyclient");
    });
    await context.addInitScript(() => {
      const originalFetch = window.fetch.bind(window);
      window.fetch = async (...args) => {
        const response = await originalFetch(...args);
        if (!response.headers.has("x-vercel-ai-ui-message-stream")) return response;
        const events = (await response.text()).split("\n\n").filter(Boolean);
        const encoder = new TextEncoder();
        let index = 0;
        return new Response(new ReadableStream({
          async pull(controller) {
            if (index === events.length) { controller.close(); return; }
            await new Promise((resolve) => setTimeout(resolve, 150));
            controller.enqueue(encoder.encode(events[index++] + "\n\n"));
          },
        }), { status: response.status, headers: response.headers });
      };
    });
    await use(state);
    expect(state.blocked, "All service traffic must be mocked").toEqual([]);
  }, { auto: true }],
});

export async function signIn(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Create your first world" })).toBeVisible();
}

export async function openDrawerIfMobile(page: Page) {
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const drawer = page.getByRole("button", { name: "Open world navigation" });
  if (await drawer.isVisible()) {
    await drawer.click();
    await expect(page.getByRole("dialog", { name: "Your worlds", exact: true })).toBeVisible();
  }
}


export async function openWorldForm(page: Page) {
  const firstWorld = page.getByRole("button", { name: "Create your first world" });
  if (await firstWorld.isVisible()) await firstWorld.click();
  else {
    await openDrawerIfMobile(page);
    await page.getByRole("button", { name: "New World", exact: true }).click();
  }
  await page.getByRole("button", { name: /Start from scratch/ }).click();
}

export async function fillWorld(page: Page, title: string) {
  await page.getByLabel("World title", { exact: true }).fill(title);
  await page.getByLabel("World description", { exact: true }).fill("A quiet forest with silver paths and lanterns.");
  await page.getByLabel("Your persona", { exact: true }).fill("A curious cartographer.");
  await page.getByLabel("Narrator’s role", { exact: true }).fill("Describe the world and offer gentle choices.");
  await page.getByRole("button", { name: "Edit as JSON", exact: true }).click();
  await page.getByLabel("Starting state (JSON)", { exact: true }).fill('{"location":"Lantern gate"}');
}

export async function createWorld(page: Page, title: string) {
  await openWorldForm(page);
  await fillWorld(page, title);
  await page.getByRole("button", { name: "Create world", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Forge a new world" })).toBeHidden();
}

export async function addKey(page: Page) {
  await page.getByRole("button", { name: "Add API key", exact: true }).click();
  await page.getByLabel("OpenRouter API key", { exact: true }).fill(fakeKey);
  await expect(page.getByRole("button", { name: "Show key", exact: true })).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Settings", exact: true })).toHaveCount(0);
}

export async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const dialog = page.getByRole("dialog");
  if (await dialog.isVisible()) expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
}
