import { NextRequest } from "next/server";
import { getRequestSupabase } from "@/lib/supabase";
import { requireUserId } from "@/lib/auth";
import { campaignPatchSchema, errorResponse, readJson, RequestError, uuidSchema } from "../../_lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
interface Params { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUserId(req);
    if (!userId) throw new RequestError(401, "Unauthorized");
    const { id } = await params;
    if (!uuidSchema.safeParse(id).success) throw new RequestError(400, "Invalid campaign ID");
    const supabase = getRequestSupabase(req);
    const { data: c, error } = await supabase.from("campaigns")
      .select("id, user_id, title, world_description, user_persona, ai_persona, created_at, updated_at")
      .eq("id", id).eq("user_id", userId).maybeSingle();
    if (error) throw error;
    if (!c) throw new RequestError(404, "Not found");
    const { data: ws, error: stateError } = await supabase.from("world_state")
      .select("state_json, updated_at").eq("campaign_id", id).maybeSingle();
    if (stateError) throw stateError;
    return Response.json({ campaign: {
      id: c.id, userId: c.user_id, title: c.title,
      worldDescription: c.world_description, userPersona: c.user_persona,
      aiPersona: c.ai_persona, createdAt: c.created_at, updatedAt: c.updated_at,
      worldState: ws ? { stateJson: ws.state_json, updatedAt: ws.updated_at } : null,
    } });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUserId(req);
    if (!userId) throw new RequestError(401, "Unauthorized");
    const { id } = await params;
    if (!uuidSchema.safeParse(id).success) throw new RequestError(400, "Invalid campaign ID");
    const { data, error } = await getRequestSupabase(req).from("campaigns")
      .delete().eq("id", id).eq("user_id", userId).select("id").maybeSingle();
    if (error) throw error;
    if (!data) throw new RequestError(404, "Not found");
    return Response.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}

const PATCH_COLUMNS = { title: "title", worldDescription: "world_description", userPersona: "user_persona", aiPersona: "ai_persona" } as const;

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUserId(req);
    if (!userId) throw new RequestError(401, "Unauthorized");
    const { id } = await params;
    if (!uuidSchema.safeParse(id).success) throw new RequestError(400, "Invalid campaign ID");
    const parsed = campaignPatchSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new RequestError(400, "Check each field: titles are up to 120 characters, the world up to 8,000, personas up to 4,000, and none may be blank.");
    const update: Record<string, string> = {};
    for (const [key, column] of Object.entries(PATCH_COLUMNS)) {
      const value = parsed.data[key as keyof typeof PATCH_COLUMNS];
      if (value !== undefined) update[column] = value;
    }
    const { data: c, error } = await getRequestSupabase(req).from("campaigns").update(update)
      .eq("id", id).eq("user_id", userId)
      .select("id, user_id, title, world_description, user_persona, ai_persona, created_at, updated_at").maybeSingle();
    if (error) throw error;
    if (!c) throw new RequestError(404, "Not found");
    return Response.json({ campaign: {
      id: c.id, userId: c.user_id, title: c.title,
      worldDescription: c.world_description, userPersona: c.user_persona,
      aiPersona: c.ai_persona, createdAt: c.created_at, updatedAt: c.updated_at,
    } });
  } catch (error) { return errorResponse(error); }
}
