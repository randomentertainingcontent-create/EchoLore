"use client";

import { useSyncExternalStore } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { browserClient } from "@/lib/supabase";
import { useCampaignStore } from "@/store/campaign-store";
import { useByokStore } from "@/store/byok-store";
import { clearDrafts } from "@/lib/drafts";

interface AuthState {
  userId: string | null;
  email: string | null;
  ready: boolean;
  recovery: boolean;
  accountVersion: number;
  error?: string;
  configured: boolean;
}

const initial: AuthState = { userId: null, email: null, ready: false, recovery: false, accountVersion: 0, configured: true };
let snapshot = initial;
let started = false;
let signingOut = false;
const listeners = new Set<() => void>();

function publish(next: AuthState) {
  const changed = snapshot.userId !== next.userId || !snapshot.ready;
  snapshot = { ...next, accountVersion: snapshot.accountVersion + (changed ? 1 : 0) };
  useCampaignStore.getState().setOwner(next.userId);
  useByokStore.getState().setOwner(next.userId);
  listeners.forEach((listener) => listener());
}

function applySession(session: Session | null, event?: AuthChangeEvent, error?: string) {
  if (signingOut) return;
  publish({
    ...snapshot,
    userId: session?.user.id ?? null,
    email: session?.user.email ?? null,
    ready: true,
    recovery: event === "PASSWORD_RECOVERY" || (event !== "SIGNED_OUT" && snapshot.recovery),
    error,
  });
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  const url = new URL(window.location.href);
  const fragment = new URLSearchParams(url.hash.slice(1));
  snapshot = { ...snapshot, recovery: url.searchParams.get("recovery") === "1" || fragment.get("type") === "recovery" };
  const linkError = fragment.has("error") || url.searchParams.has("error")
    ? "This email link is invalid or expired. Request a new reset link, or sign in again."
    : undefined;
  try {
    const client = browserClient();
    let events = 0;
    client.auth.onAuthStateChange((event, session) => {
      events += 1;
      applySession(session, event, event === "INITIAL_SESSION" ? linkError : undefined);
    });
    const version = events;
    void client.auth.getSession().then(({ data, error }) => {
      if (events !== version) return;
      applySession(error ? null : data.session, undefined, error ? "Could not restore your session. Please sign in again." : linkError);
    }).catch(() => {
      if (events === version) applySession(null, undefined, "Could not restore your session. Please sign in again.");
    });
  } catch {
    publish({ ...initial, ready: true, configured: false, error: "Sign-in is unavailable. Configure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, then rebuild EchoLore." });
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  start();
  return () => { listeners.delete(listener); };
}

export function completeRecovery() {
  const url = new URL(window.location.href);
  url.searchParams.delete("recovery");
  url.hash = "";
  window.history.replaceState(window.history.state, "", url);
  publish({ ...snapshot, recovery: false, error: undefined });
}

export async function signOutAccount() {
  if (signingOut) return;
  signingOut = true;
  publish({ ...snapshot, userId: null, email: null, ready: false, recovery: false, error: undefined });
  useCampaignStore.getState().reset();
  useByokStore.getState().clearKey();
  clearDrafts();
  try {
    const { error } = await browserClient().auth.signOut({ scope: "local" });
    if (error) throw error;
    signingOut = false;
    completeRecovery();
    applySession(null, "SIGNED_OUT");
  } catch (error) {
    signingOut = false;
    const message = error instanceof Error ? error.message : "Could not sign out. Please try again.";
    try {
      const { data } = await browserClient().auth.getSession();
      applySession(data.session, undefined, message);
    } catch {
      applySession(null, undefined, message);
    }
  }
}

export function useMockUser(): AuthState {
  return useSyncExternalStore(subscribe, () => snapshot, () => initial);
}
