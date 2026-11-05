import type { getRequestSupabase } from "@/lib/supabase";
import { RequestError } from "./validation";

type Supabase = ReturnType<typeof getRequestSupabase>;

/**
 * Run a story-mutating operation while holding the campaign's generation lease,
 * so it can never interleave with a reply that is still being written.
 */
export async function withGenerationLease<T>(supabase: Supabase, campaignId: string, run: () => Promise<T>): Promise<T> {
  const leaseId = crypto.randomUUID();
  const { data: acquired, error } = await supabase.rpc("acquire_generation_lease", { p_campaign_id: campaignId, p_lease_id: leaseId });
  if (error) throw error;
  if (!acquired) throw new RequestError(409, "A reply is still being written. Try again in a moment.");
  try {
    return await run();
  } finally {
    try { await supabase.rpc("release_generation_lease", { p_campaign_id: campaignId, p_lease_id: leaseId }); }
    catch {}
  }
}

export async function assertOwnedCampaign(supabase: Supabase, campaignId: string, userId: string) {
  const { data, error } = await supabase.from("campaigns").select("id").eq("id", campaignId).eq("user_id", userId).maybeSingle();
  if (error) throw error;
  if (!data) throw new RequestError(404, "Not found");
}
