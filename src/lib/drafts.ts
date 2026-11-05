/** Composer drafts survive switching worlds (in memory only — never persisted, cleared on sign-out). */
export const drafts = new Map<string, string>();

export function clearDrafts() {
  drafts.clear();
}
