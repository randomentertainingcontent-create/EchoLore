begin;
set local search_path = public, extensions;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.campaigns'::regclass and conname = 'campaigns_user_id_fkey') then
    alter table public.campaigns add constraint campaigns_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade not valid;
  end if;
end $$;

create table if not exists public.generation_leases (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  lease_id uuid not null,
  expires_at timestamptz not null,
  completed boolean not null default false
);
alter table public.generation_leases enable row level security;
drop policy if exists generation_leases_own on public.generation_leases;
create policy generation_leases_own on public.generation_leases for all to authenticated
using (exists (select 1 from public.campaigns c where c.id = campaign_id and c.user_id = auth.uid()))
with check (exists (select 1 from public.campaigns c where c.id = campaign_id and c.user_id = auth.uid()));
revoke all on public.generation_leases from anon;
grant select, insert, update, delete on public.generation_leases to authenticated;

create or replace function public.valid_lore_state(p_state jsonb)
returns boolean language sql immutable set search_path = public as $$
  select coalesce(jsonb_typeof(p_state) = 'object' and octet_length(p_state::text) <= 32000, false);
$$;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.world_state'::regclass and conname = 'world_state_bounded_object') then
    alter table public.world_state add constraint world_state_bounded_object check (public.valid_lore_state(state_json)) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.messages'::regclass and conname = 'messages_bounded_content') then
    alter table public.messages add constraint messages_bounded_content check (char_length(btrim(content)) between 1 and 16000) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.campaigns'::regclass and conname = 'campaigns_bounded_content') then
    alter table public.campaigns add constraint campaigns_bounded_content check (
      char_length(btrim(title)) between 1 and 120 and char_length(btrim(world_description)) between 1 and 8000
      and char_length(btrim(user_persona)) between 1 and 4000 and char_length(btrim(ai_persona)) between 1 and 4000
    ) not valid;
  end if;
end $$;

drop policy if exists embeddings_all_own on public.embeddings;
create policy embeddings_all_own on public.embeddings for all to authenticated
using (exists (select 1 from public.campaigns c where c.id = embeddings.campaign_id and c.user_id = auth.uid()))
with check (
  char_length(embeddings.content) between 1 and 16000
  and exists (select 1 from public.messages m join public.campaigns c on c.id = m.campaign_id
    where m.id = embeddings.message_id and m.campaign_id = embeddings.campaign_id and c.user_id = auth.uid())
);

create or replace function public.create_campaign(
  p_title text, p_world_description text, p_user_persona text, p_ai_persona text, p_starting_state jsonb default '{}'::jsonb
) returns setof public.campaigns language plpgsql security invoker set search_path = public as $$
declare
  created public.campaigns;
begin
  if auth.uid() is null then raise exception 'Unauthorized'; end if;
  if p_title is null or char_length(btrim(p_title)) not between 1 and 120
    or p_world_description is null or char_length(btrim(p_world_description)) not between 1 and 8000
    or p_user_persona is null or char_length(btrim(p_user_persona)) not between 1 and 4000
    or p_ai_persona is null or char_length(btrim(p_ai_persona)) not between 1 and 4000
    or not public.valid_lore_state(p_starting_state) then
    raise exception 'Invalid campaign';
  end if;
  insert into public.campaigns(user_id, title, world_description, user_persona, ai_persona)
  values (auth.uid(), btrim(p_title), btrim(p_world_description), btrim(p_user_persona), btrim(p_ai_persona)) returning * into created;
  insert into public.world_state(campaign_id, state_json) values (created.id, p_starting_state);
  return next created;
end $$;

create or replace function public.acquire_generation_lease(p_campaign_id uuid, p_lease_id uuid)
returns boolean language plpgsql security invoker set search_path = public as $$
declare acquired uuid;
begin
  if auth.uid() is null or p_lease_id is null or not exists (select 1 from public.campaigns where id = p_campaign_id and user_id = auth.uid()) then
    raise exception 'Unauthorized';
  end if;
  insert into public.generation_leases(campaign_id, lease_id, expires_at, completed)
  values (p_campaign_id, p_lease_id, clock_timestamp() + interval '180 seconds', false)
  on conflict (campaign_id) do update set lease_id = excluded.lease_id, expires_at = excluded.expires_at, completed = false
  where generation_leases.expires_at <= clock_timestamp()
  returning lease_id into acquired;
  return acquired is not null;
end $$;

create or replace function public.release_generation_lease(p_campaign_id uuid, p_lease_id uuid)
returns void language sql security invoker set search_path = public as $$
  delete from public.generation_leases where campaign_id = p_campaign_id and lease_id = p_lease_id;
$$;

create or replace function public.complete_generation(
  p_campaign_id uuid, p_lease_id uuid, p_user_content text, p_assistant_content text,
  p_user_embedding vector(1536) default null, p_assistant_embedding vector(1536) default null
) returns void language plpgsql security invoker set search_path = public, extensions as $$
declare
  user_message uuid;
  assistant_message uuid;
  turn_time timestamptz := clock_timestamp();
begin
  if auth.uid() is null then raise exception 'Unauthorized'; end if;
  perform 1 from public.generation_leases where campaign_id = p_campaign_id and lease_id = p_lease_id
    and expires_at > clock_timestamp() and not completed for update;
  if not found then raise exception 'Generation lease expired'; end if;
  if p_user_content is null or char_length(btrim(p_user_content)) not between 1 and 16000
    or p_assistant_content is null or char_length(btrim(p_assistant_content)) not between 1 and 16000 then
    raise exception 'Invalid turn';
  end if;
  insert into public.messages(campaign_id, role, content, created_at) values (p_campaign_id, 'user', p_user_content, turn_time) returning id into user_message;
  insert into public.messages(campaign_id, role, content, created_at) values (p_campaign_id, 'assistant', p_assistant_content, turn_time + interval '1 microsecond') returning id into assistant_message;
  if p_user_embedding is not null then
    insert into public.embeddings(message_id, campaign_id, content, embedding) values (user_message, p_campaign_id, p_user_content, p_user_embedding);
  end if;
  if p_assistant_embedding is not null then
    insert into public.embeddings(message_id, campaign_id, content, embedding) values (assistant_message, p_campaign_id, p_assistant_content, p_assistant_embedding);
  end if;
  update public.campaigns set updated_at = clock_timestamp() where id = p_campaign_id;
  update public.generation_leases set completed = true where campaign_id = p_campaign_id and lease_id = p_lease_id;
end $$;

create or replace function public.update_generation_lore(p_campaign_id uuid, p_lease_id uuid, p_state jsonb)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if auth.uid() is null or not public.valid_lore_state(p_state) then raise exception 'Invalid state'; end if;
  perform 1 from public.generation_leases where campaign_id = p_campaign_id and lease_id = p_lease_id
    and expires_at > clock_timestamp() and completed for update;
  if not found then raise exception 'Generation lease expired'; end if;
  insert into public.world_state(campaign_id, state_json) values (p_campaign_id, p_state)
  on conflict (campaign_id) do update set state_json = excluded.state_json;
end $$;

create or replace function public.match_embeddings(p_campaign_id uuid, p_query_vec vector(1536), p_limit int default 5)
returns table(id uuid, message_id uuid, content text, similarity float)
language sql stable security invoker set search_path = public, extensions as $$
  select e.id, e.message_id, left(e.content, 8000), 1 - (e.embedding <=> p_query_vec)
  from public.embeddings e
  where e.campaign_id = p_campaign_id
    and exists (select 1 from public.campaigns c where c.id = p_campaign_id and c.user_id = auth.uid())
  order by e.embedding <=> p_query_vec
  limit greatest(1, least(coalesce(p_limit, 5), 5));
$$;

create or replace function public.backend_schema_version()
returns integer language sql stable security invoker as $$ select 1; $$;

revoke all on function public.create_campaign(text, text, text, text, jsonb) from public, anon;
revoke all on function public.acquire_generation_lease(uuid, uuid) from public, anon;
revoke all on function public.release_generation_lease(uuid, uuid) from public, anon;
revoke all on function public.complete_generation(uuid, uuid, text, text, vector, vector) from public, anon;
revoke all on function public.update_generation_lore(uuid, uuid, jsonb) from public, anon;
revoke all on function public.match_embeddings(uuid, vector, int) from public, anon;
revoke all on function public.backend_schema_version() from public, anon;
grant execute on function public.create_campaign(text, text, text, text, jsonb) to authenticated;
grant execute on function public.acquire_generation_lease(uuid, uuid) to authenticated;
grant execute on function public.release_generation_lease(uuid, uuid) to authenticated;
grant execute on function public.complete_generation(uuid, uuid, text, text, vector, vector) to authenticated;
grant execute on function public.update_generation_lore(uuid, uuid, jsonb) to authenticated;
grant execute on function public.match_embeddings(uuid, vector, int) to authenticated;
grant execute on function public.backend_schema_version() to authenticated;

commit;
