import { NextRequest } from "next/server";
import { streamText, generateText } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { serverAdmin } from "@/lib/supabase";
import { getUserIdFromHeaders } from "@/lib/auth";
import { readByokHeaders } from "@/lib/byok/headers";
import { compilePrompt } from "@/lib/rag/compile-prompt";
import { generateEmbedding } from "@/lib/rag/embedding";
import type { RetrievedMemory, Message, MessageRole } from "@/types/echolore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/chat
 * Body: { campaignId: string, message: string }
 *
 * RAG pipeline:
 *   A. Save user message → messages table
 *   B. Embed user message (OpenRouter text-embedding-3-small) → embeddings table
 *   C. Vector similarity search (cosine distance) via Supabase RPC `match_embeddings`
 *      → top 5 most relevant past events
 *   D. Pull last 5 raw messages → working memory
 *   E. Compile mega-prompt (directive + world + state + memories + working + input)
 *   F. streamText via Vercel AI SDK + OpenRouter → AI reply
 *   G. Save full AI reply → messages + embeddings tables
 *   H. If (campaign message count) % 4 === 0, fire background lorebook sync
 */
export async function POST(req: NextRequest) {
  try {
    const headers = readByokHeaders(req.headers);
    const userId = headers["x-user-id"];

    let body: {
      campaignId?: string;
      message?: string;
      messages?: { role: string; content?: string; parts?: { type: string; text?: string }[] }[];
    };
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { campaignId, message, messages } = body;
    if (!campaignId) {
      return Response.json(
        { error: "campaignId is required in the request body" },
        { status: 400 },
      );
    }

    // Extract the user's current message. AI SDK 6's useChat sends the full
    // message history in `messages` — the last one is the user's new input.
    // We also accept a top-level `message` field for direct API calls.
    let userMessage = message?.trim();
    if (!userMessage && messages && messages.length > 0) {
      const last = messages[messages.length - 1];
      if (last?.role === "user") {
        userMessage = last.parts
          ?.filter((p) => p.type === "text")
          .map((p) => p.text ?? "")
          .join("")
          .trim() || last.content?.trim();
      }
    }
    if (!userMessage) {
      return Response.json(
        { error: "No user message found in request (neither `message` nor last `messages[]` entry)" },
        { status: 400 },
      );
    }

  const supabase = serverAdmin();

  // --- Ownership check + load campaign + world_state ---
  const { data: campaign, error: cErr } = await supabase
    .from("campaigns")
    .select("id, user_id, title, world_description, user_persona, ai_persona")
    .eq("id", campaignId)
    .eq("user_id", userId)
    .maybeSingle();

  if (cErr) {
    return Response.json({ error: `Supabase error: ${cErr.message}` }, { status: 500 });
  }
  if (!campaign) {
    return Response.json({ error: "Campaign not found" }, { status: 404 });
  }

  const { data: ws } = await supabase
    .from("world_state")
    .select("state_json")
    .eq("campaign_id", campaignId)
    .maybeSingle();
  const worldState = (ws?.state_json ?? null) as Record<string, unknown> | null;

  // --- A. Save user message ---
  const { data: userMsg, error: mErr } = await supabase
    .from("messages")
    .insert({ campaign_id: campaignId, role: "user", content: userMessage })
    .select("id, campaign_id, role, content, created_at")
    .single();

  if (mErr || !userMsg) {
    return Response.json({ error: `Failed to save message: ${mErr?.message}` }, { status: 500 });
  }

  // --- B. Embed user message + save ---
  let userEmbedding: number[] = [];
  try {
    userEmbedding = await generateEmbedding(
      headers["x-openrouter-key"],
      headers["x-embed-model"],
      userMessage,
    );
    await supabase.from("embeddings").insert({
      message_id: userMsg.id,
      campaign_id: campaignId,
      content: userMessage,
      embedding: userEmbedding,
    });
  } catch (e) {
    console.error("[echolore] user embedding failed:", (e as Error).message);
  }

  // --- C. Vector similarity search via Supabase RPC (pgvector cosine distance) ---
  let memories: RetrievedMemory[] = [];
  if (userEmbedding.length > 0) {
    try {
      const { data: matches, error: rErr } = await supabase.rpc("match_embeddings", {
        p_campaign_id: campaignId,
        p_query_vec: userEmbedding,
        p_limit: 6,
      });
      if (rErr) {
        console.error("[echolore] vector search failed:", rErr.message);
      } else if (matches) {
        memories = (matches as RetrievedMemory[])
          .filter((r) => r.message_id !== userMsg.id)
          .slice(0, 5);
      }
    } catch (e) {
      console.error("[echolore] vector RPC failed:", (e as Error).message);
    }
  }

  // --- D. Working memory: last 5 raw messages (excluding the one we just saved) ---
  const { data: recent } = await supabase
    .from("messages")
    .select("id, campaign_id, role, content, created_at")
    .eq("campaign_id", campaignId)
    .neq("id", userMsg.id)
    .order("created_at", { ascending: false })
    .limit(5);

  const workingMemory: Message[] = (recent ?? [])
    .reverse()
    .map((m) => ({
      id: m.id,
      campaignId: m.campaign_id,
      role: m.role as MessageRole,
      content: m.content,
      createdAt: m.created_at,
    }));

  // --- E. Compile mega-prompt ---
  const compiled = compilePrompt({
    campaign: {
      worldDescription: campaign.world_description,
      userPersona: campaign.user_persona,
      aiPersona: campaign.ai_persona,
    },
    worldState,
    memories,
    workingMemory,
    userMessage,
  });

  // --- F. streamText via Vercel AI SDK + OpenRouter ---
  const openrouter = createOpenRouter({ apiKey: headers["x-openrouter-key"] });

  const result = streamText({
    model: openrouter(headers["x-chat-model"], {
      // Strip reasoning tokens from the response. Some free models on
      // OpenRouter (e.g. openai/gpt-oss-20b:free) are reasoning models —
      // without this, their inner monologue leaks into the visible reply
      // (e.g. "Need to respond as friend in world...Hey there!").
      reasoning: { exclude: true },
    }),
    system: compiled.system,
    messages: compiled.messages,
    temperature: 0.85,
    maxOutputTokens: 1024,
  });

  // --- G. Persist the assistant reply after streaming completes ---
  (async () => {
    try {
      const fullText = (await result.text).trim();
      if (!fullText) return;

      const { data: assistantMsg } = await supabase
        .from("messages")
        .insert({ campaign_id: campaignId, role: "assistant", content: fullText })
        .select("id")
        .single();

      // Embed the assistant reply — so future turns can retrieve it.
      if (assistantMsg) {
        try {
          const asstEmbedding = await generateEmbedding(
            headers["x-openrouter-key"],
            headers["x-embed-model"],
            fullText,
          );
          await supabase.from("embeddings").insert({
            message_id: assistantMsg.id,
            campaign_id: campaignId,
            content: fullText,
            embedding: asstEmbedding,
          });
        } catch (e) {
          console.error("[echolore] assistant embedding failed:", (e as Error).message);
        }
      }

      // --- H. Trigger background lorebook sync every 4th message ---
      const { count } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", campaignId);

      if ((count ?? 0) > 0 && (count ?? 0) % 4 === 0) {
        void triggerLorebookSync({
          campaignId,
          apiKey: headers["x-openrouter-key"],
          loreModel: headers["x-lore-model"],
          supabase,
        }).catch((e) =>
          console.error("[echolore] lorebook sync failed:", (e as Error).message),
        );
      }
    } catch (e) {
      console.error("[echolore] post-stream persistence failed:", (e as Error).message);
    }
  })();

  return result.toUIMessageStreamResponse();
  } catch (e) {
    console.error("[echolore] POST /api/chat failed:", (e as Error).message);
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

/**
 * Background lorebook updater.
 *
 * Triggered after every 4th message in a campaign. Uses a cheap/fast OpenRouter
 * model to read recent chat and propose an updated world_state JSON. The result
 * is upserted into the world_state table.
 */
async function triggerLorebookSync(args: {
  campaignId: string;
  apiKey: string;
  loreModel: string;
  supabase: ReturnType<typeof serverAdmin>;
}) {
  const { campaignId, apiKey, loreModel, supabase } = args;

  const [{ data: recentMsgs }, { data: ws }] = await Promise.all([
    supabase
      .from("messages")
      .select("role, content")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: false })
      .limit(4),
    supabase
      .from("world_state")
      .select("state_json")
      .eq("campaign_id", campaignId)
      .maybeSingle(),
  ]);

  const currentStateJson = JSON.stringify(ws?.state_json ?? {});
  const recentChat = (recentMsgs ?? [])
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

  const openrouter = createOpenRouter({ apiKey });
  const { text } = await generateText({
    model: openrouter(loreModel, { reasoning: { exclude: true } }),
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

  await supabase.from("world_state").upsert(
    { campaign_id: campaignId, state_json: parsed },
    { onConflict: "campaign_id" },
  );
}
