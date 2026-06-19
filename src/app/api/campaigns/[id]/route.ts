import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserIdFromHeaders } from "@/lib/auth";

interface Params { params: Promise<{ id: string }> }

/** GET /api/campaigns/:id — fetch one campaign + current world_state */
export async function GET(req: NextRequest, { params }: Params) {
  const userId = getUserIdFromHeaders(req.headers);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const campaign = await db.campaign.findFirst({
    where: { id, userId },
    include: { worldState: true },
  });
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ campaign });
}

/** DELETE /api/campaigns/:id — cascade delete (messages, embeddings, world_state) */
export async function DELETE(req: NextRequest, { params }: Params) {
  const userId = getUserIdFromHeaders(req.headers);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  // findFirst ensures ownership before delete
  const owned = await db.campaign.findFirst({ where: { id, userId } });
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.campaign.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
