import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserIdFromHeaders } from "@/lib/auth";
import type { NewCampaignInput } from "@/types/echolore";

/**
 * GET /api/campaigns
 * List all campaigns for the current (mock) user.
 * Header: x-user-id
 */
export async function GET(req: NextRequest) {
  const userId = getUserIdFromHeaders(req.headers);
  if (!userId) {
    return NextResponse.json({ error: "Missing x-user-id header" }, { status: 401 });
  }

  const campaigns = await db.campaign.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { messages: true } } },
  });

  return NextResponse.json({ campaigns });
}

/**
 * POST /api/campaigns
 * Create a new campaign ("New World" setup flow).
 * Body: { title, worldDescription, userPersona, aiPersona, startingState? }
 */
export async function POST(req: NextRequest) {
  const userId = getUserIdFromHeaders(req.headers);
  if (!userId) {
    return NextResponse.json({ error: "Missing x-user-id header" }, { status: 401 });
  }

  let body: NewCampaignInput;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { title, worldDescription, userPersona, aiPersona, startingState } = body;

  if (!title?.trim())            return NextResponse.json({ error: "Title is required" }, { status: 400 });
  if (!worldDescription?.trim()) return NextResponse.json({ error: "World description is required" }, { status: 400 });
  if (!userPersona?.trim())      return NextResponse.json({ error: "User persona is required" }, { status: 400 });
  if (!aiPersona?.trim())        return NextResponse.json({ error: "AI persona is required" }, { status: 400 });

  const campaign = await db.campaign.create({
    data: {
      userId,
      title: title.trim(),
      worldDescription: worldDescription.trim(),
      userPersona: userPersona.trim(),
      aiPersona: aiPersona.trim(),
      worldState: startingState && Object.keys(startingState).length > 0
        ? { create: { stateJson: JSON.stringify(startingState) } }
        : { create: { stateJson: "{}" } },
    },
    include: { worldState: true },
  });

  return NextResponse.json({ campaign }, { status: 201 });
}
