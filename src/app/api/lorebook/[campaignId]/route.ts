import { NextRequest } from "next/server";
import { getRequestSupabase } from "@/lib/supabase";
import { requireUserId } from "@/lib/auth";
import { assertOwnedCampaign } from "../../_lib/lease";
import { errorResponse, lorePutSchema, readJson, RequestError, uuidSchema } from "../../_lib/validation";

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
    const { data: state, error } = await supabase.from("world_state")
      .select("state_json, updated_at").eq("campaign_id", campaignId).maybeSingle();
    if (error) throw error;
    return Response.json({ state: state?.state_json ?? {}, updatedAt: state?.updated_at ?? null });
  } catch (error) { return errorResponse(error); }
}

/** Replace the lorebook with a player-edited JSON object. */
export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const { supabase, campaignId } = await setup(req, params);
    const parsed = lorePutSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new RequestError(400, "The lorebook must be a JSON object: up to 6 levels deep, 100 entries per object, 4,000 characters per value.");
    const { data, error } = await supabase.from("world_state")
      .upsert({ campaign_id: campaignId, state_json: parsed.data.state }, { onConflict: "campaign_id" })
      .select("state_json, updated_at").maybeSingle();
    if (error) throw error;
    return Response.json({ state: data?.state_json ?? parsed.data.state, updatedAt: data?.updated_at ?? new Date().toISOString() });
  } catch (error) { return errorResponse(error); }
}
