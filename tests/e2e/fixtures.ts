import { expect, test as base, type Page } from "@playwright/test";

export const fakeKey = "sk-or-v1-local-test-not-a-real-key";
export const reply = "The lantern flickers. A silver path opens through the forest.";

type ChatBody = {
  world: { worldDescription: string; userPersona: string; aiPersona: string };
  worldState: Record<string, unknown>;
  history: { role: string; content: string }[];
  memories: { role: string; content: string; similarity: number }[];
  message: string;
  options: { responseLength: string; creativity: number };
};

export type MockState = {
  failChat: boolean;
  requests: string[];
  chatBodies: ChatBody[];
  loreCalls: number;
  blocked: string[];
};

/** A deterministic 1536-dim "embedding" so local recall can be exercised. */
function vector(text: string) {
  const v = Array<number>(1536).fill(0);
  for (const word of text.toLowerCase().match(/[a-z]+/g) ?? []) {
    let h = 0;
    for (const ch of word) h = (h * 31 + ch.charCodeAt(0)) % 1536;
    v[h] += 1;
  }
  v[0] += 0.01;
  return v;
}

export const test = base.extend<{ mock: MockState }>({
  mock: [async ({ context }, use) => {
    const state: MockState = { failChat: false, requests: [], chatBodies: [], loreCalls: 0, blocked: [] };
    await context.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const method = request.method();
      const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
      if (url.origin === "http://127.0.0.1:3100" && url.pathname.startsWith("/api/")) {
        state.requests.push(`${method} ${url.pathname}`);
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
        if (url.pathname === "/api/embed" && method === "POST") {
          expect(request.headers()["x-openrouter-key"]).toBe(fakeKey);
          const { texts } = request.postDataJSON() as { texts: string[] };
          await json({ embeddings: texts.map(vector) });
          return;
        }
        if (url.pathname === "/api/lore" && method === "POST") {
          state.loreCalls += 1;
          const body = request.postDataJSON() as { state: Record<string, unknown> };
          await json({ state: { ...body.state, keeper_noted: `update ${state.loreCalls}` } });
          return;
        }
        if (url.pathname === "/api/chat" && method === "POST") {
          expect(request.headers()["x-openrouter-key"]).toBe(fakeKey);
          const body = request.postDataJSON() as ChatBody;
          expect(Object.keys(body).sort()).toEqual(["history", "memories", "message", "options", "world", "worldState"]);
          state.chatBodies.push(body);
          if (state.failChat) { await json({ error: "Mock narrator unavailable" }, 503); return; }
          const id = `reply-${state.chatBodies.length}`;
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

export async function start(page: Page) {
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

export async function waitForReply(page: Page) {
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeHidden();
  await expect(page.getByRole("status").filter({ hasText: "Saving" })).toHaveCount(0);
}

export async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const dialog = page.getByRole("dialog");
  if (await dialog.isVisible()) expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
}
