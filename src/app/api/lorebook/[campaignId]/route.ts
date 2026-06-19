import { NextRequest, NextResponse } from "next/server";
import { serverAdmin } from "@/lib/supabase";
import { getUserIdFromHeaders } from "@/lib/auth";

interface Params { params: Promise<{ campaignId: string }> }

/**
 * GET /api/lorebook/:campaignId
 * Returns the current world_state JSON for a campaign.
 */
export async function GET(req: NextRequest, { params }: Params) {
  const userId = getUserIdFromHeaders(req.headers);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { campaignId } = await params;
  const supabase = serverAdmin();

  // Verify ownership
  const { data: owned } = await supabase
    .from("campaigns")
    .select("id")
    .eq("id", campaignId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: state } = await supabase
    .from("world_state")
    .select("state_json, updated_at")
    .eq("campaign_id", campaignId)
    .maybeSingle();

  return NextResponse.json({
    state: state?.state_json ?? {},
    updatedAt: state?.updated_at ?? null,
  });
}
