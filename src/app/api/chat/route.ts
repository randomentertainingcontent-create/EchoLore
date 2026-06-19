import { NextRequest } from "next/server";
import { streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { db } from "@/lib/db";
import { getUserIdFromHeaders } from "@/lib/auth";
import { readByokHeaders } from "@/lib/byok/headers";
import { compilePrompt } from "@/lib/rag/compile-prompt";
import { generateEmbedding } from "@/lib/rag/embedding";
import { topKSimilar, parseVector } from "@/lib/rag/local-vector";
import type { RetrievedMemory, Message } from "@/types/echolore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/chat
 * Body: { campaignId: string, message: string }
 *
 * RAG pipeline:
 *   A. Save user message → messages table
 *   B. Embed user message (OpenAI text-embedding-3-small) → embeddings table
 *   C. Vector similarity search (cosine) on embeddings table for that campaign
 *      → top 5 most relevant past events
 *   D. Pull last 5 raw messages → working memory
 *   E. Compile mega-prompt (directive + world + state + memories + working + input)
 *   F. streamText via Vercel AI SDK → AI reply
 *   G. Save full AI reply → messages + embeddings tables
 *   H. If (campaign message count) % 4 === 0, fire background lorebook sync
 */
export async function POST(req: NextRequest) {
  const headers = readByokHeaders(req.headers);
  const userId = headers["x-user-id"];

  let body: { campaignId?: string; message?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { campaignId, message } = body;
  if (!campaignId || !message?.trim()) {
    return Response.json(
      { error: "Both campaignId and message are required" },
      { status: 400 },
    );
  }

  // --- Ownership check ---
  const campaign = await db.campaign.findFirst({
    where: { id: campaignId, userId },
    include: { worldState: true },
  });
  if (!campaign) {
    return Response.json({ error: "Campaign not found" }, { status: 404 });
  }

  // --- A. Save user message ---
  const userMsg = await db.message.create({
    data: { campaignId, role: "user", content: message.trim() },
  });

  // --- B. Embed user message + save ---
  let userEmbedding: number[] = [];
  try {
    userEmbedding = await generateEmbedding(
      headers["x-user-api-key"],
      headers["x-embed-model"],
      message.trim(),
    );
    await db.embedding.create({
      data: {
        messageId: userMsg.id,
        campaignId,
        content: message.trim(),
        vector: JSON.stringify(userEmbedding),
      },
    });
  } catch (e) {
    console.error("[echolore] user embedding failed:", (e as Error).message);
  }

  // --- C. Vector similarity search (top 5) ---
  let memories: RetrievedMemory[] = [];
  if (userEmbedding.length > 0) {
    try {
      const allEmbeddings = await db.embedding.findMany({
        where: { campaignId },
        select: { id: true, messageId: true, content: true, vector: true },
      });
      if (allEmbeddings.length > 0) {
        const rows = allEmbeddings.map((r) => ({
          id: r.id,
          messageId: r.messageId,
          content: r.content,
          vector: parseVector(r.vector),
        }));
        memories = topKSimilar(rows, userEmbedding, 6)
          .filter((r) => r.messageId !== userMsg.id)
          .slice(0, 5);
      }
    } catch (e) {
      console.error("[echolore] vector search failed:", (e as Error).message);
    }
  }

  // --- D. Working memory: last 5 raw messages (excluding the one we just saved) ---
  const recentMsgs = await db.message.findMany({
    where: { campaignId, id: { not: userMsg.id } },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  const workingMemory: Message[] = recentMsgs
    .reverse()
    .map((m) => ({
      id: m.id,
      campaignId: m.campaignId,
      role: m.role as Message["role"],
      content: m.content,
      createdAt: m.createdAt.toISOString(),
    }));

  // --- E. Compile mega-prompt ---
  const worldState = campaign.worldState?.stateJson
    ? (JSON.parse(campaign.worldState.stateJson) as Record<string, unknown>)
    : null;

  const compiled = compilePrompt({
    campaign: {
      worldDescription: campaign.worldDescription,
      userPersona: campaign.userPersona,
      aiPersona: campaign.aiPersona,
    },
    worldState,
    memories,
    workingMemory,
    userMessage: message.trim(),
  });

  // --- F. streamText via Vercel AI SDK ---
  const openai = createOpenAI({ apiKey: headers["x-user-api-key"] });

  const result = streamText({
    model: openai(headers["x-chat-model"]),
    system: compiled.system,
    // compiled.messages are already in ModelMessage shape ({role, content}).
    messages: compiled.messages,
    temperature: 0.85,
    maxOutputTokens: 1024,
  });

  // --- G. Persist the assistant reply after streaming completes ---
  (async () => {
    try {
      const fullText = (await result.text).trim();
      if (!fullText) return;

      const assistantMsg = await db.message.create({
        data: { campaignId, role: "assistant", content: fullText },
      });

      // Embed the assistant reply — so future turns can retrieve it.
      try {
        const asstEmbedding = await generateEmbedding(
          headers["x-user-api-key"],
          headers["x-embed-model"],
          fullText,
        );
        await db.embedding.create({
          data: {
            messageId: assistantMsg.id,
            campaignId,
            content: fullText,
            vector: JSON.stringify(asstEmbedding),
          },
        });
      } catch (e) {
        console.error("[echolore] assistant embedding failed:", (e as Error).message);
      }

      // --- H. Trigger background lorebook sync every 4th message ---
      const totalMsgs = await db.message.count({ where: { campaignId } });
      if (totalMsgs > 0 && totalMsgs % 4 === 0) {
        void triggerLorebookSync({
          campaignId,
          apiKey: headers["x-user-api-key"],
          loreModel: headers["x-lore-model"],
        }).catch((e) =>
          console.error("[echolore] lorebook sync failed:", (e as Error).message),
        );
      }
    } catch (e) {
      console.error("[echolore] post-stream persistence failed:", (e as Error).message);
    }
  })();

  return result.toDataStreamResponse();
}

/**
 * Background lorebook updater.
 *
 * Triggered after every 4th message in a campaign. Uses a cheap/fast model
 * (gpt-4o-mini by default) to read recent chat and propose an updated
 * world_state JSON. The result is upserted into the world_state table.
 */
async function triggerLorebookSync(args: {
  campaignId: string;
  apiKey: string;
  loreModel: string;
}) {
  const { campaignId, apiKey, loreModel } = args;

  const [campaign, recentMsgs, currentState] = await Promise.all([
    db.campaign.findUnique({ where: { id: campaignId } }),
    db.message.findMany({
      where: { campaignId },
      orderBy: { createdAt: "desc" },
      take: 4,
      select: { role: true, content: true },
    }),
    db.worldState.findUnique({ where: { campaignId } }),
  ]);
  if (!campaign) return;

  const currentStateJson = currentState?.stateJson ?? "{}";
  const recentChat = recentMsgs
    .reverse()
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n\n");

  const prompt = `You are the lorebook keeper for a roleplay campaign. Based on the recent conversation, has the user's location, inventory, health, or active quests (or any other field already in the state) changed?

Output ONLY the updated JSON state. Do not add commentary, do not wrap in markdown fences. If nothing has changed, output the current state unchanged.

Preserve the existing structure of the JSON. Only add new keys when the user has clearly acquired or established something new (e.g. a new quest, a new inventory item). Drop keys only when something is genuinely lost or consumed.

# Current State
${currentStateJson}

# Recent Chat (last 4 messages)
${recentChat}

# Updated JSON State:`;

  const openai = createOpenAI({ apiKey });
  const { generateText } = await import("ai");
  const { text } = await generateText({
    model: openai(loreModel),
    prompt,
    temperature: 0.1,
    maxOutputTokens: 800,
  });

  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    console.error("[echolore] lorebook returned invalid JSON, skipping update");
    return;
  }

  await db.worldState.upsert({
    where: { campaignId },
    create: { campaignId, stateJson: JSON.stringify(parsed) },
    update: { stateJson: JSON.stringify(parsed) },
  });
}
