-- ============================================================================
-- EchoLore — Schema patch: drop the auth.users FK on campaigns.user_id
-- ----------------------------------------------------------------------------
-- The original schema.sql has `user_id uuid references auth.users(id)`, which
-- requires every user to be a real Supabase Auth user. EchoLore currently uses
-- a mock single-user UUID (stored in localStorage) so the app works without
-- auth setup. This patch loosens the FK so mock UUIDs can be used.
--
-- When you wire up real Supabase Auth later, run the REVERSE of this patch
-- (re-add the FK) and drop the mock-user hook.
--
-- Run this in Supabase SQL editor: Dashboard → SQL Editor → New query → Run
-- ============================================================================

-- Drop the FK constraint on campaigns.user_id
alter table public.campaigns
  drop constraint if exists campaigns_user_id_fkey;

-- (Optional) Re-add it later when Supabase Auth is wired up:
-- alter table public.campaigns
--   add constraint campaigns_user_id_fkey
--   foreign key (user_id) references auth.users(id) on delete cascade;

-- Verify
select 'FK dropped — mock UUIDs can now be used for user_id' as status;
