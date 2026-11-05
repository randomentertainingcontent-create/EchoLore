import { NextRequest } from "next/server";
import { getRequestSupabase } from "@/lib/supabase";
import { requireUserId } from "@/lib/auth";
import { EMBED_MODEL, HDR_OPENROUTER_KEY } from "@/lib/byok/headers";
import { generateEmbedding } from "@/lib/rag/embedding";
import { assertOwnedCampaign, withGenerationLease } from "../../_lib/lease";
import { errorResponse, messageEditSchema, readJson, RequestError, uuidSchema } from "../../_lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
interface Params { params: Promise<{ campaignId: string }> }

async function setup(req: NextRequest, params: Params["params"]) {
  const userId = await requireUserId(req);
  if (!userId) throw new RequestError(401, "Unauthorized");
  const { campaignId } = await params;
  if (!uuidSchema.safeParse(campaignId).success) throw new RequestError(400, "Invalid campaign ID");
  const supabase = getRequestSupabase(req);
  await assertOwnedCampaign(supabase, campaignId, userId);
  return { supabase, campaignId };
}

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { supabase, campaignId } = await setup(req, params);
    const { data, error } = await supabase.from("messages")
      .select("id, campaign_id, role, content, created_at")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(200);
    if (error) throw error;
    return Response.json({ messages: (data ?? []).reverse().map((m) => ({
      id: m.id, campaignId: m.campaign_id, role: m.role, content: m.content, createdAt: m.created_at,
    })) });
  } catch (error) { return errorResponse(error); }
}

/**
 * Rewind: DELETE /api/messages/:campaignId?from=<messageId>
 * Removes that message and everything after it (their memories cascade).
 * Powers "Regenerate", "Rewind to here" and "Edit & resend".
 */
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const { supabase, campaignId } = await setup(req, params);
    const from = req.nextUrl.searchParams.get("from");
    if (!uuidSchema.safeParse(from).success) throw new RequestError(400, "Invalid message ID");
    const deleted = await withGenerationLease(supabase, campaignId, async () => {
      const { data: anchor, error } = await supabase.from("messages").select("created_at")
        .eq("id", from).eq("campaign_id", campaignId).maybeSingle();
      if (error) throw error;
      if (!anchor) throw new RequestError(404, "Message not found");
      const { data: rows, error: deleteError } = await supabase.from("messages").delete()
        .eq("campaign_id", campaignId).gte("created_at", anchor.created_at).select("id");
      if (deleteError) throw deleteError;
      return rows?.length ?? 0;
    });
    return Response.json({ deleted });
  } catch (error) { return errorResponse(error); }
}

/**
 * Edit: PATCH /api/messages/:campaignId  { messageId, content }
 * Rewrites a message in place and refreshes its memory embedding when an
 * OpenRouter key is supplied (otherwise the stale memory is simply dropped).
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { supabase, campaignId } = await setup(req, params);
    const parsed = messageEditSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new RequestError(400, "Messages must be 1–16,000 characters.");
    const { messageId, content } = parsed.data;
    const key = req.headers.get(HDR_OPENROUTER_KEY)?.trim();
    const message = await withGenerationLease(supabase, campaignId, async () => {
      const { data, error } = await supabase.from("messages").update({ content })
        .eq("id", messageId).eq("campaign_id", campaignId)
        .select("id, campaign_id, role, content, created_at").maybeSingle();
      if (error) throw error;
      if (!data) throw new RequestError(404, "Message not found");
      await supabase.from("embeddings").delete().eq("message_id", messageId);
      if (key && /^[\x21-\x7e]{1,512}$/.test(key)) {
        try {
          const embedding = await generateEmbedding(key, EMBED_MODEL, content);
          await supabase.from("embeddings").insert({ message_id: messageId, campaign_id: campaignId, content, embedding });
        } catch {}
      }
      return data;
    });
    return Response.json({ message: {
      id: message.id, campaignId: message.campaign_id, role: message.role, content: message.content, createdAt: message.created_at,
    } });
  } catch (error) { return errorResponse(error); }
}
