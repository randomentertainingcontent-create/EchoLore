import { NextRequest } from "next/server";
import { getRequestSupabase } from "@/lib/supabase";
import { requireUserId } from "@/lib/auth";
import { errorResponse, RequestError } from "../_lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    if (!await requireUserId(req)) throw new RequestError(401, "Unauthorized");
    const { data, error } = await getRequestSupabase(req).rpc("backend_schema_version");
    if (error || data !== 1) {
      return Response.json({ ok: false, schemaInstalled: false, error: "Database setup required" }, { status: 503 });
    }
    return Response.json({ ok: true, schemaInstalled: true });
  } catch (error) { return errorResponse(error); }
}
