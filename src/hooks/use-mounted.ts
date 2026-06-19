"use client";

import { useSyncExternalStore } from "react";

/**
 * useMounted — React 19-safe hydration guard.
 *
 * The old pattern of `useEffect(() => setMounted(true), [])` triggers the
 * new `react-hooks/set-state-in-effect` rule. `useSyncExternalStore` is the
 * React-recommended way to read a value that differs between server & client.
 *
 * Returns `false` during SSR / first render, then `true` after hydration.
 */
const subscribe = () => () => {};
const getSnapshot = () => true;     // client snapshot — always true
const getServerSnapshot = () => false; // server snapshot — always false

export function useMounted(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
