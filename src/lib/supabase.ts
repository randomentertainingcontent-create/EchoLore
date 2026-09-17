import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function settings() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) throw new Error("Service unavailable");
  return { url, key };
}

export function getBearerToken(req: Request): string | null {
  const value = req.headers.get("authorization");
  if (!value || value.length > 8192) return null;
  return /^Bearer ([A-Za-z0-9._~-]+)$/i.exec(value)?.[1] ?? null;
}

const requestClients = new WeakMap<Request, SupabaseClient>();

export function getRequestSupabase(req: Request): SupabaseClient {
  const existing = requestClients.get(req);
  if (existing) return existing;
  const token = getBearerToken(req);
  if (!token) throw new Error("Unauthorized");
  const { url, key } = settings();
  const client = createClient(url, key, {
    global: {
      headers: { Authorization: `Bearer ${token}` },
      fetch: (input, init) => fetch(input, {
        ...init,
        signal: AbortSignal.any([AbortSignal.timeout(10000), ...(init?.signal ? [init.signal] : [])]),
      }),
    },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  requestClients.set(req, client);
  return client;
}

let browser: SupabaseClient | undefined;

export function browserClient(): SupabaseClient {
  if (!browser) {
    const { url, key } = settings();
    browser = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } });
  }
  return browser;
}
