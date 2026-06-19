import { NextRequest, NextResponse } from "next/server";
import { serverAdmin } from "@/lib/supabase";
import { getUserIdFromHeaders } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params { params: Promise<{ id: string }> }

/** GET /api/campaigns/:id — fetch one campaign + current world_state */
export async function GET(req: NextRequest, { params }: Params) {
  try {
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
  } catch (e) {
    console.error("[echolore] GET /api/campaigns/[id] failed:", (e as Error).message);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/** DELETE /api/campaigns/:id — cascade delete handled by FK on_delete cascade */
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const userId = getUserIdFromHeaders(req.headers);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const supabase = serverAdmin();

    // Check ownership FIRST — Supabase delete is idempotent (returns 200 even
    // if 0 rows were deleted), so we need to verify the row exists + is owned
    // by the user before deleting, otherwise we'd return 200 for nonexistent IDs.
    const { data: owned } = await supabase
      .from("campaigns")
      .select("id")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

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
  } catch (e) {
    console.error("[echolore] DELETE /api/campaigns/[id] failed:", (e as Error).message);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
