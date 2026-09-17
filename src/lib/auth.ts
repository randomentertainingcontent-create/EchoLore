import { getBearerToken, getRequestSupabase } from "@/lib/supabase";

export async function requireUserId(req: Request): Promise<string | null> {
  const token = getBearerToken(req);
  if (!token) return null;
  try {
    const { data, error } = await getRequestSupabase(req).auth.getUser(token);
    return error ? null : data.user?.id ?? null;
  } catch {
    return null;
  }
}
