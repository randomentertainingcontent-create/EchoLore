import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserIdFromHeaders } from "@/lib/auth";

interface Params { params: Promise<{ campaignId: string }> }

/**
 * GET /api/messages/:campaignId
 * Returns the full message history for a campaign, oldest → newest.
 * (For very long campaigns we'll add pagination later — for now, load all.)
 */
export async function GET(req: NextRequest, { params }: Params) {
  const userId = getUserIdFromHeaders(req.headers);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { campaignId } = await params;

  // Verify ownership
  const owned = await db.campaign.findFirst({ where: { id: campaignId, userId } });
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const messages = await db.message.findMany({
    where: { campaignId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      campaignId: true,
      role: true,
      content: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    messages: messages.map((m) => ({
      ...m,
      createdAt: m.createdAt.toISOString(),
    })),
  });
}
