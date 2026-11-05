"use client";

import { useSyncExternalStore } from "react";
import type { Session } from "@supabase/supabase-js";
import { browserClient } from "@/lib/supabase";
import { useCampaignStore } from "@/store/campaign-store";
import { useByokStore } from "@/store/byok-store";

/**
 * Guest sessions: there is no sign-up or sign-in form. On first visit the
 * browser gets a Supabase anonymous user, which row-level security treats like
 * any other authenticated user, so worlds stay private to this browser.
 * Existing email accounts with a saved session keep working unchanged.
 */
interface AuthState {
  userId: string | null;
  email: string | null;
  isGuest: boolean;
  ready: boolean;
  accountVersion: number;
  error?: string;
  configured: boolean;
}

const initial: AuthState = { userId: null, email: null, isGuest: true, ready: false, accountVersion: 0, configured: true };
let snapshot = initial;
let started = false;
let signingIn: Promise<void> | null = null;
const listeners = new Set<() => void>();

function publish(next: AuthState) {
  const changed = snapshot.userId !== next.userId || !snapshot.ready;
  snapshot = { ...next, accountVersion: snapshot.accountVersion + (changed && next.ready ? 1 : 0) };
  useCampaignStore.getState().setOwner(next.userId);
  useByokStore.getState().setOwner(next.userId);
  listeners.forEach((listener) => listener());
}

function applySession(session: Session | null) {
  publish({
    ...snapshot,
    userId: session?.user.id ?? null,
    email: session?.user.email ?? null,
    isGuest: session ? Boolean(session.user.is_anonymous) || !session.user.email : true,
    ready: true,
    error: undefined,
  });
}

function guestError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/anonymous sign-ins are disabled/i.test(message)) {
    return "Guest play is switched off for this Supabase project. In the Supabase dashboard, open Authentication → Sign In / Providers and turn on “Allow anonymous sign-ins”, then retry.";
  }
  if (/rate limit/i.test(message)) return "Too many new guest sessions from this network right now. Wait a few minutes and retry.";
  if (/fetch|network/i.test(message)) return "Couldn’t reach the database. Check your connection, or that the Supabase project isn’t paused, then retry.";
  return "Couldn’t start a guest session. Retry in a moment.";
}

/** Reuse the saved session, or create a guest one. */
export function ensureSession(): Promise<void> {
  signingIn ??= (async () => {
    try {
      const client = browserClient();
      const { data, error } = await client.auth.getSession();
      if (!error && data.session) { applySession(data.session); return; }
      const result = await client.auth.signInAnonymously();
      if (result.error || !result.data.session) throw result.error ?? new Error("No session");
      applySession(result.data.session);
    } catch (error) {
      publish({ ...snapshot, userId: null, email: null, ready: true, error: guestError(error) });
    } finally {
      signingIn = null;
    }
  })();
  return signingIn;
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  try {
    const client = browserClient();
    client.auth.onAuthStateChange((event, session) => {
      if (event === "INITIAL_SESSION") return;
      if (session) applySession(session);
      else if (event === "SIGNED_OUT") void ensureSession();
    });
    void ensureSession();
  } catch {
    publish({ ...initial, ready: true, configured: false, error: "EchoLore isn’t connected to a database yet. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, then rebuild." });
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  start();
  return () => { listeners.delete(listener); };
}

export function useMockUser(): AuthState {
  return useSyncExternalStore(subscribe, () => snapshot, () => initial);
}
