import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
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
  const owned = await db.campaign.findFirst({ where: { id: campaignId, userId } });
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const state = await db.worldState.findUnique({ where: { campaignId } });
  return NextResponse.json({
    state: state ? JSON.parse(state.stateJson) : {},
    updatedAt: state?.updatedAt.toISOString() ?? null,
  });
}
