-- ============================================================================
-- EchoLore — Supabase / PostgreSQL Schema (Production)
-- ----------------------------------------------------------------------------
-- 1.  Create a new Supabase project:  https://supabase.com/dashboard
-- 2.  Open the SQL Editor → New query
-- 3.  Paste this entire file → Run
-- 4.  Copy the resulting project URL + anon key into your .env (see README)
-- ----------------------------------------------------------------------------
-- pgvector is used for semantic memory retrieval (RAG).
-- Row Level Security is enabled so each user can only see their own data.
-- ============================================================================

-- Required Supabase extension: pgvector
-- (Supabase dashboard: Database → Extensions → enable "vector")
create extension if not exists vector;

-- ============================================================================
-- ENUMS
-- ============================================================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'message_role') then
    create type message_role as enum ('user', 'assistant', 'system');
  end if;
end$$;

-- ============================================================================
-- TABLES
-- ============================================================================

-- campaigns: one per "world" a user creates
create table if not exists public.campaigns (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  title              text not null,
  world_description  text not null,
  user_persona       text not null,
  ai_persona         text not null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists idx_campaigns_user_id   on public.campaigns (user_id);
create index if not exists idx_campaigns_created_at on public.campaigns (created_at desc);

-- messages: raw chat history (used for working memory — last 5)
create table if not exists public.messages (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null references public.campaigns (id) on delete cascade,
  role         message_role not null,
  content      text not null,
  created_at   timestamptz not null default now()
);
create index if not exists idx_messages_campaign_created
  on public.messages (campaign_id, created_at desc);

-- embeddings: vectorized memories (used for semantic recall — top 5)
create table if not exists public.embeddings (
  id           uuid primary key default gen_random_uuid(),
  message_id   uuid not null references public.messages (id) on delete cascade,
  campaign_id  uuid not null references public.campaigns (id) on delete cascade,
  content      text not null,
  embedding    vector(1536) not null,  -- OpenAI text-embedding-3-small
  created_at   timestamptz not null default now()
);
create index if not exists idx_embeddings_campaign
  on public.embeddings (campaign_id);

-- Vector similarity search (cosine distance) — HNSW index for production speed.
-- Re-run this safely after pgvector is enabled and the column exists.
create index if not exists idx_embeddings_embedding_hnsw
  on public.embeddings
  using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

-- world_state: dynamic lorebook (JSONB) — one row per campaign, upserted by the
-- background updater every N messages.
create table if not exists public.world_state (
  campaign_id  uuid primary key references public.campaigns (id) on delete cascade,
  state_json   jsonb not null default '{}'::jsonb,
  updated_at   timestamptz not null default now()
);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
alter table public.campaigns   enable row level security;
alter table public.messages    enable row level security;
alter table public.embeddings  enable row level security;
alter table public.world_state enable row level security;

-- Users can only touch rows where campaigns.user_id = auth.uid().
-- Child tables inherit ownership transitively via campaign_id.

drop policy if exists "campaigns_select_own"  on public.campaigns;
drop policy if exists "campaigns_insert_own"  on public.campaigns;
drop policy if exists "campaigns_update_own"  on public.campaigns;
drop policy if exists "campaigns_delete_own"  on public.campaigns;
create policy "campaigns_select_own" on public.campaigns for select using (auth.uid() = user_id);
create policy "campaigns_insert_own" on public.campaigns for insert with check (auth.uid() = user_id);
create policy "campaigns_update_own" on public.campaigns for update using (auth.uid() = user_id);
create policy "campaigns_delete_own" on public.campaigns for delete using (auth.uid() = user_id);

drop policy if exists "messages_all_own" on public.messages;
create policy "messages_all_own" on public.messages
  for all
  using (
    exists (select 1 from public.campaigns c
            where c.id = messages.campaign_id and c.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.campaigns c
            where c.id = messages.campaign_id and c.user_id = auth.uid())
  );

drop policy if exists "embeddings_all_own" on public.embeddings;
create policy "embeddings_all_own" on public.embeddings
  for all
  using (
    exists (select 1 from public.campaigns c
            where c.id = embeddings.campaign_id and c.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.campaigns c
            where c.id = embeddings.campaign_id and c.user_id = auth.uid())
  );

drop policy if exists "world_state_all_own" on public.world_state;
create policy "world_state_all_own" on public.world_state
  for all
  using (
    exists (select 1 from public.campaigns c
            where c.id = world_state.campaign_id and c.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.campaigns c
            where c.id = world_state.campaign_id and c.user_id = auth.uid())
  );

-- ============================================================================
-- UPDATED_AT TRIGGER
-- ============================================================================
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end$$;

drop trigger if exists trg_campaigns_touch on public.campaigns;
create trigger trg_campaigns_touch before update on public.campaigns
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_world_state_touch on public.world_state;
create trigger trg_world_state_touch before update on public.world_state
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- HELPER: vector similarity search function (optional, convenience)
-- Call with:  select * from public.match_embeddings(p_campaign_id, p_query_vec, 5)
-- ============================================================================
create or replace function public.match_embeddings(
  p_campaign_id uuid,
  p_query_vec   vector(1536),
  p_limit       int default 5
)
returns table (
  id          uuid,
  message_id  uuid,
  content     text,
  similarity  float
)
language sql stable as $$
  select
    e.id,
    e.message_id,
    e.content,
    1 - (e.embedding <=> p_query_vec) as similarity
  from public.embeddings e
  where e.campaign_id = p_campaign_id
  order by e.embedding <=> p_query_vec
  limit p_limit;
$$;

-- Done. You should now see tables: campaigns, messages, embeddings, world_state
-- in your Supabase dashboard, with RLS enabled and pgvector ready.
