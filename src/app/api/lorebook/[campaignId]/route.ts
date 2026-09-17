import { NextRequest } from "next/server";
import { getRequestSupabase } from "@/lib/supabase";
import { requireUserId } from "@/lib/auth";
import { errorResponse, RequestError, uuidSchema } from "../../_lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
interface Params { params: Promise<{ campaignId: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUserId(req);
    if (!userId) throw new RequestError(401, "Unauthorized");
    const { campaignId } = await params;
    if (!uuidSchema.safeParse(campaignId).success) throw new RequestError(400, "Invalid campaign ID");
    const supabase = getRequestSupabase(req);
    const { data: owned, error: ownershipError } = await supabase.from("campaigns")
      .select("id").eq("id", campaignId).eq("user_id", userId).maybeSingle();
    if (ownershipError) throw ownershipError;
    if (!owned) throw new RequestError(404, "Not found");
    const { data: state, error } = await supabase.from("world_state")
      .select("state_json, updated_at").eq("campaign_id", campaignId).maybeSingle();
    if (error) throw error;
    return Response.json({ state: state?.state_json ?? {}, updatedAt: state?.updated_at ?? null });
  } catch (error) { return errorResponse(error); }
}
