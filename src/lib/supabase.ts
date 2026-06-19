import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase clients for EchoLore.
 *
 * Two clients:
 *   - serverAdmin: uses the service_role key, bypasses RLS. Used ONLY in
 *     server-side route handlers. The key is read from SUPABASE_SERVICE_ROLE_KEY
 *     and MUST NEVER be exposed to the browser.
 *   - browser: uses the anon key, subject to RLS. Used in client components.
 *     The key is safe to expose (NEXT_PUBLIC_).
 *
 * For the local preview we use the same Supabase project as production —
 * there is no separate local DB. Create a free Supabase project, run
 * supabase/schema.sql in the SQL editor, and paste your URL + keys into .env.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL is not set. Create a free Supabase project at " +
    "https://supabase.com/dashboard, run supabase/schema.sql in the SQL editor, " +
    "and paste your project URL into .env"
  );
}
if (!ANON_KEY) {
  throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not set. See .env.example.");
}

/**
 * Server-side admin client. Bypasses RLS via service_role key.
 *
 * EchoLore uses a mock single-user pattern (UUID in localStorage) for now,
 * so we need service_role to read/write rows owned by that mock UUID without
 * requiring Supabase Auth. In production with real Supabase Auth, swap this
 * for a per-request user client (supabase.auth.getUser()) and let RLS do its job.
 */
let _serverAdmin: SupabaseClient | null = null;
export function serverAdmin(): SupabaseClient {
  if (!_serverAdmin) {
    if (!SERVICE_ROLE_KEY) {
      throw new Error(
        "SUPABASE_SERVICE_ROLE_KEY is not set. Server-side route handlers need " +
        "this to bypass RLS until Supabase Auth is wired up. Find it at " +
        "Supabase dashboard → Project Settings → API → service_role secret."
      );
    }
    _serverAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _serverAdmin;
}

/** Browser-side client. Uses anon key, subject to RLS. */
export function browserClient(): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: true },
  });
}
