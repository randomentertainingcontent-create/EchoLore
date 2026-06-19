import { NextRequest, NextResponse } from "next/server";
import { serverAdmin } from "@/lib/supabase";
import { getUserIdFromHeaders } from "@/lib/auth";

interface Params { params: Promise<{ campaignId: string }> }

/**
 * GET /api/messages/:campaignId
 * Returns the full message history for a campaign, oldest → newest.
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

  const { data: messages, error } = await supabase
    .from("messages")
    .select("id, campaign_id, role, content, created_at")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    messages: (messages ?? []).map((m) => ({
      id: m.id,
      campaignId: m.campaign_id,
      role: m.role,
      content: m.content,
      createdAt: m.created_at,
    })),
  });
}
