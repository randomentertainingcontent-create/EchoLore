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
 * IMPORTANT: All env var reads are INSIDE the functions (lazy), not at module
 * top-level. This is critical for Vercel — Next.js evaluates route modules at
 * build time during page-data collection, and throwing at module load breaks
 * the build even when env vars are set in the Vercel project. Lazy evaluation
 * means the throw only happens when a route is actually called at runtime.
 *
 * For the local preview we use the same Supabase project as production —
 * there is no separate local DB. Create a free Supabase project, run
 * supabase/schema.sql in the SQL editor, and paste your URL + keys into .env.
 */

function getEnv(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) {
    throw new Error(
      `${name} is not set. Create a free Supabase project at ` +
      "https://supabase.com/dashboard, run supabase/schema.sql in the SQL editor, " +
      "and paste your project URL + keys into .env (locally) or Vercel env vars " +
      "(production). See .env.example for the full list."
    );
  }
  return v.trim();
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
    const url = getEnv("NEXT_PUBLIC_SUPABASE_URL");
    const serviceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    _serverAdmin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _serverAdmin;
}

/** Browser-side client. Uses anon key, subject to RLS. */
export function browserClient(): SupabaseClient {
  const url = getEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return createClient(url, anonKey, {
    auth: { persistSession: true },
  });
}
