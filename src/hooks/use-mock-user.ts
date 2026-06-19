"use client";

import { useSyncExternalStore } from "react";
import { v4 as uuid } from "uuid";

const STORAGE_KEY = "echolore:user-id";

// Use useSyncExternalStore for the ready flag to satisfy React 19's
// set-state-in-effect rule (mounted-guard pattern).
const subscribe = () => () => {};
const getServerSnapshot = () => null;
function getClientUserId(): string | null {
  if (typeof window === "undefined") return null;
  let id = window.localStorage.getItem(STORAGE_KEY);
  if (!id) {
    id = uuid();
    window.localStorage.setItem(STORAGE_KEY, id);
  }
  return id;
}

/**
 * Mock single-user for the local preview.
 *
 * Generates a stable random UUID on first visit and stores it in localStorage.
 * Every campaign/message created is tagged with this UUID as `userId`.
 *
 * In production with Supabase Auth enabled, replace this hook with
 * `useSupabaseUser()` from `@supabase/auth-helpers-nextjs`. The data model
 * and RLS policies already expect `auth.uid()` to match `user_id`.
 */
export function useMockUser(): { userId: string | null; ready: boolean } {
  const userId = useSyncExternalStore(subscribe, getClientUserId, getServerSnapshot);
  return { userId, ready: userId !== null };
}


