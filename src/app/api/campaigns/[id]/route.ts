import { NextRequest, NextResponse } from "next/server";
import { serverAdmin } from "@/lib/supabase";
import { getUserIdFromHeaders } from "@/lib/auth";

interface Params { params: Promise<{ id: string }> }

/** GET /api/campaigns/:id — fetch one campaign + current world_state */
export async function GET(req: NextRequest, { params }: Params) {
  const userId = getUserIdFromHeaders(req.headers);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const supabase = serverAdmin();

  const { data: campaign, error } = await supabase
    .from("campaigns")
    .select("id, user_id, title, world_description, user_persona, ai_persona, created_at, updated_at")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: `Supabase error: ${error.message}` },
      { status: 500 },
    );
  }
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Fetch world_state separately
  const { data: ws } = await supabase
    .from("world_state")
    .select("state_json, updated_at")
    .eq("campaign_id", id)
    .maybeSingle();

  return NextResponse.json({
    campaign: {
      id: campaign.id,
      userId: campaign.user_id,
      title: campaign.title,
      worldDescription: campaign.world_description,
      userPersona: campaign.user_persona,
      aiPersona: campaign.ai_persona,
      createdAt: campaign.created_at,
      updatedAt: campaign.updated_at,
      worldState: ws ? { stateJson: ws.state_json, updatedAt: ws.updated_at } : null,
    },
  });
}

/** DELETE /api/campaigns/:id — cascade delete handled by FK on_delete cascade */
export async function DELETE(req: NextRequest, { params }: Params) {
  const userId = getUserIdFromHeaders(req.headers);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const supabase = serverAdmin();

  // The .eq("user_id", userId) ensures ownership
  const { error } = await supabase
    .from("campaigns")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) {
    return NextResponse.json(
      { error: `Failed to delete: ${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
