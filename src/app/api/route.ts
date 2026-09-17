import { requireUserId } from "@/lib/auth";

export async function GET(req: Request) {
  if (!await requireUserId(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json({ ok: true });
}
