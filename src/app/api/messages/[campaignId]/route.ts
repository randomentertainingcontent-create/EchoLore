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
