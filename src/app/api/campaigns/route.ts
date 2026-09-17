import { NextRequest } from "next/server";
import { getRequestSupabase } from "@/lib/supabase";
import { requireUserId } from "@/lib/auth";
import { campaignSchema, errorResponse, readJson, RequestError } from "../_lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mapCampaign(c: Record<string, unknown>) {
  return {
    id: c.id, userId: c.user_id, title: c.title,
    worldDescription: c.world_description, userPersona: c.user_persona,
    aiPersona: c.ai_persona, createdAt: c.created_at, updatedAt: c.updated_at,
  };
}

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId(req);
    if (!userId) throw new RequestError(401, "Unauthorized");
    const { data, error } = await getRequestSupabase(req)
      .from("campaigns")
      .select("id, user_id, title, world_description, user_persona, ai_persona, created_at, updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return Response.json({ campaigns: (data ?? []).map(mapCampaign) });
  } catch (error) { return errorResponse(error); }
}

export async function POST(req: NextRequest) {
  try {
    if (!await requireUserId(req)) throw new RequestError(401, "Unauthorized");
    const parsed = campaignSchema.safeParse(await readJson(req));
    if (!parsed.success) {
      const field = parsed.error.issues[0]?.path[0];
      const labels: Record<string, string> = { title: "World title", worldDescription: "World description", userPersona: "Your persona", aiPersona: "Narrator’s role" };
      throw new RequestError(400, field === "startingState"
        ? "Starting state must be a compact JSON object with at most 6 nesting levels, 100 entries per object, and 4,000 characters per value."
        : `${typeof field === "string" ? labels[field] ?? "World details" : "World details"} is missing or invalid. Check the field and its character limit.`);
    }
    const body = parsed.data;
    const { data, error } = await getRequestSupabase(req).rpc("create_campaign", {
      p_title: body.title,
      p_world_description: body.worldDescription,
      p_user_persona: body.userPersona,
      p_ai_persona: body.aiPersona,
      p_starting_state: body.startingState ?? {},
    }).single();
    if (error) {
      if (["PGRST202", "42P01", "42883"].includes(error.code)) {
        throw new RequestError(503, "Database setup is incomplete. Ask the app administrator to apply supabase/schema.sql for a new database, then supabase/hardening.sql. Your world has not been created.");
      }
      if (error.code === "42501") throw new RequestError(403, "The database denied world creation. Ask the app administrator to check authenticated permissions and row-level security policies.");
      if (error.code === "23503") throw new RequestError(409, "Your account could not be linked to this world. Sign out and sign in again; if this continues, ask the administrator to check the database migration.");
      throw new RequestError(503, "Could not save your world. The database may be unavailable. Your entries are kept; please try again shortly.");
    }
    if (!data) throw new RequestError(503, "The database did not confirm creation. Refresh your worlds before trying again.");
    return Response.json({ campaign: { ...mapCampaign(data as Record<string, unknown>), worldState: { stateJson: body.startingState ?? {} } } }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
