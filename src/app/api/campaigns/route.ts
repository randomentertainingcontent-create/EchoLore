import { NextRequest, NextResponse } from "next/server";
import { serverAdmin } from "@/lib/supabase";
import { getUserIdFromHeaders } from "@/lib/auth";
import type { NewCampaignInput } from "@/types/echolore";

// Force dynamic rendering — never statically evaluate at build time.
// This prevents Vercel's "Failed to collect page data" build errors when
// env vars aren't available during the build phase.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/campaigns
 * List all campaigns for the current (mock) user.
 * Header: x-user-id
 */
export async function GET(req: NextRequest) {
  try {
    const userId = getUserIdFromHeaders(req.headers);
    if (!userId) {
      return NextResponse.json({ error: "Missing x-user-id header" }, { status: 401 });
    }

    const supabase = serverAdmin();
    const { data, error } = await supabase
      .from("campaigns")
      .select("id, user_id, title, world_description, user_persona, ai_persona, created_at, updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: `Supabase error: ${error.message}. Did you run supabase/schema.sql?` },
        { status: 500 },
      );
    }

    const campaigns = (data ?? []).map((c) => ({
      id: c.id,
      userId: c.user_id,
      title: c.title,
      worldDescription: c.world_description,
      userPersona: c.user_persona,
      aiPersona: c.ai_persona,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
    }));

    return NextResponse.json({ campaigns });
  } catch (e) {
    console.error("[echolore] GET /api/campaigns failed:", (e as Error).message);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/**
 * POST /api/campaigns
 * Create a new campaign ("New World" setup flow).
 * Body: { title, worldDescription, userPersona, aiPersona, startingState? }
 */
export async function POST(req: NextRequest) {
  try {
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

    const supabase = serverAdmin();

    const { data: campaign, error: cErr } = await supabase
      .from("campaigns")
      .insert({
        user_id: userId,
        title: title.trim(),
        world_description: worldDescription.trim(),
        user_persona: userPersona.trim(),
        ai_persona: aiPersona.trim(),
      })
      .select()
      .single();

    if (cErr || !campaign) {
      return NextResponse.json(
        { error: `Failed to create campaign: ${cErr?.message ?? "unknown"}` },
        { status: 500 },
      );
    }

    const stateJson = startingState && Object.keys(startingState).length > 0
      ? startingState
      : {};

    // Validate starting state is a plain object (not array/primitive/null).
    // Supabase JSONB accepts any JSON, but our schema expects an object.
    if (startingState != null) {
      if (typeof startingState !== "object" || Array.isArray(startingState)) {
        return NextResponse.json(
          { error: "Starting state must be a JSON object (e.g. {\"location\": \"...\"}), not an array or primitive." },
          { status: 400 },
        );
      }
    }

    const { error: wsErr } = await supabase
      .from("world_state")
      .insert({
        campaign_id: campaign.id,
        state_json: stateJson,
      });

    if (wsErr) {
      console.error("[echolore] world_state insert failed:", wsErr.message);
    }

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
      },
    }, { status: 201 });
  } catch (e) {
    console.error("[echolore] POST /api/campaigns failed:", (e as Error).message);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
