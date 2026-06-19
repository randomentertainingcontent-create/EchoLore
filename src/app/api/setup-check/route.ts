import { NextResponse } from "next/server";
import { serverAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/setup-check
 * Verifies that the Supabase schema is installed by trying to query the
 * campaigns table. Returns a friendly status object the frontend can use
 * to show a "run schema.sql" message if setup isn't complete.
 */
export async function GET() {
  try {
    const supabase = serverAdmin();
    const { error } = await supabase
      .from("campaigns")
      .select("id")
      .limit(1);

    if (error) {
      return NextResponse.json({
        ok: false,
        schemaInstalled: false,
        error: error.message,
        hint: "Run supabase/schema.sql in your Supabase SQL editor (Dashboard → SQL Editor → New query → paste the file → Run).",
      }, { status: 200 });
    }

    return NextResponse.json({
      ok: true,
      schemaInstalled: true,
    });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      schemaInstalled: false,
      error: (e as Error).message,
      hint: "Make sure NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY are set in .env (local) or Vercel env vars (production).",
    }, { status: 200 });
  }
}
