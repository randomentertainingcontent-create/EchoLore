/**
 * Server-side helpers for extracting the mock user identity from request headers.
 *
 * EchoLore is BYOK and (for now) uses a mock single-user model: the client
 * generates a UUID in localStorage and attaches it to every request via the
 * `x-user-id` header. In production with Supabase Auth, replace this with
 * `auth.uid()` from the Supabase server client.
 */

export const HDR_USER_ID = "x-user-id";

/** Read the user-id from the request headers. Returns null if missing. */
export function getUserIdFromHeaders(headers: Headers): string | null {
  return headers.get(HDR_USER_ID);
}
