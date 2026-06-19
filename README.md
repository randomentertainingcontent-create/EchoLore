# EchoLore

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Frandomentertainingcontent-create%2FEchoLore&env=NEXT_PUBLIC_SUPABASE_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY&envDescription=Supabase%20project%20URL%20and%20anon%20key%20(only%20required%20for%20production%20deployment%20%E2%80%94%20the%20local%20preview%20runs%20on%20SQLite)&project-name=echolore&repository-name=echolore)

> **BYOK AI roleplay with RAG memory.** Create custom worlds, become anyone, and let an AI Game Master remember every twist — powered by vectorized memories and a dynamic lorebook.

EchoLore is an open-source, Bring-Your-Own-Key roleplay client designed to **max out AI memory** so it feels like real life. Instead of sending the entire chat history to the LLM, EchoLore uses a RAG (Retrieval-Augmented Generation) architecture: it vectorizes past events, dynamically retrieves the most relevant memories, and tracks world state via a JSON lorebook so the AI perfectly remembers your custom universe.

---

## ✨ Features

- **Build entirely custom worlds.** Define the world, who you are, and the AI's role. The AI acts as a dynamic Game Master / Storyteller.
- **RAG memory.** Every message is embedded with `text-embedding-3-small`. The top 5 most semantically relevant past events are injected into every prompt — so an offhand detail from 200 messages ago can resurface naturally.
- **Working memory.** The last 5 raw messages are always injected for immediate conversational continuity.
- **Dynamic lorebook.** A JSON `world_state` (location, inventory, health, quests, etc.) is auto-updated by a background `gpt-4o-mini` call after every 4th message, so the AI never forgets where you are or what you're carrying.
- **Streaming responses.** The Game Master's reply streams in token-by-token via the Vercel AI SDK.
- **BYOK — Bring Your Own Key.** Paste your OpenAI API key. It lives in your browser's `localStorage` only — never persisted server-side, never logged. One key handles chat, embeddings, and the lorebook updater.
- **One-click Vercel deploy.** Click the badge above, paste your Supabase keys, and you're live.

---

## 🧱 Tech Stack

| Layer            | Choice                                                           |
| ---------------- | ---------------------------------------------------------------- |
| Frontend         | Next.js 16 (App Router), Tailwind CSS, shadcn/ui                 |
| AI / LLM         | Vercel AI SDK 6 + `@ai-sdk/openai` (gpt-4o-mini default)         |
| Embeddings       | OpenAI `text-embedding-3-small` (1536 dimensions)                |
| Production DB    | Supabase (PostgreSQL + pgvector + RLS)                           |
| Local preview DB | Prisma + SQLite (with JS-side cosine similarity for vectors)     |
| Hosting          | Vercel                                                           |

> **Why OpenAI only?** One key handles everything (chat, lorebook, embeddings), the RAG vector dimension stays consistent at 1536, and `gpt-4o-mini` is cheap enough to actually use. The Vercel AI SDK makes it trivial to add more providers later — see `src/lib/rag/embedding.ts` and `src/app/api/chat/route.ts`.

---

## 🚀 Quick Start (Local Preview)

The repo ships with a **dual-layer** database architecture:

- **Local preview** uses Prisma + SQLite so you can run the app immediately with zero external setup. Embeddings are stored as JSON and cosine similarity is computed in JavaScript.
- **Production** uses the supplied `supabase/schema.sql` (PostgreSQL + pgvector) for real vector similarity search at scale.

### Prerequisites

- Node.js 20+ (or [Bun](https://bun.sh) 1.1+)
- An OpenAI API key → https://platform.openai.com/api-keys

### Install & run

```bash
git clone https://github.com/randomentertainingcontent-create/EchoLore.git
cd EchoLore
bun install          # or: npm install
cp .env.example .env # default SQLite path is fine for local preview
bun run db:push      # create the local SQLite database
bun run dev          # http://localhost:3000
```

Open the app, click **Settings** (top-right), paste your OpenAI API key, and click **New World** to begin.

---

## 🗄️ Production Setup (Supabase)

1. **Create a Supabase project** → https://supabase.com/dashboard
2. **Enable pgvector:** Dashboard → Database → Extensions → enable `vector`
3. **Run the schema:** Dashboard → SQL Editor → New query → paste the entire contents of [`supabase/schema.sql`](./supabase/schema.sql) → Run

<details>
<summary><strong>📋 Copy-paste the SQL schema (click to expand)</strong></summary>

```sql
-- ============================================================================
-- EchoLore — Supabase / PostgreSQL Schema (Production)
-- ============================================================================

create extension if not exists vector;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'message_role') then
    create type message_role as enum ('user', 'assistant', 'system');
  end if;
end$$;

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

create table if not exists public.messages (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null references public.campaigns (id) on delete cascade,
  role         message_role not null,
  content      text not null,
  created_at   timestamptz not null default now()
);
create index if not exists idx_messages_campaign_created
  on public.messages (campaign_id, created_at desc);

create table if not exists public.embeddings (
  id           uuid primary key default gen_random_uuid(),
  message_id   uuid not null references public.messages (id) on delete cascade,
  campaign_id  uuid not null references public.campaigns (id) on delete cascade,
  content      text not null,
  embedding    vector(1536) not null,
  created_at   timestamptz not null default now()
);
create index if not exists idx_embeddings_campaign on public.embeddings (campaign_id);
create index if not exists idx_embeddings_embedding_hnsw
  on public.embeddings using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

create table if not exists public.world_state (
  campaign_id  uuid primary key references public.campaigns (id) on delete cascade,
  state_json   jsonb not null default '{}'::jsonb,
  updated_at   timestamptz not null default now()
);

alter table public.campaigns   enable row level security;
alter table public.messages    enable row level security;
alter table public.embeddings  enable row level security;
alter table public.world_state enable row level security;

drop policy if exists "campaigns_select_own"  on public.campaigns;
drop policy if exists "campaigns_insert_own"  on public.campaigns;
drop policy if exists "campaigns_update_own"  on public.campaigns;
drop policy if exists "campaigns_delete_own"  on public.campaigns;
create policy "campaigns_select_own" on public.campaigns for select using (auth.uid() = user_id);
create policy "campaigns_insert_own" on public.campaigns for insert with check (auth.uid() = user_id);
create policy "campaigns_update_own" on public.campaigns for update using (auth.uid() = user_id);
create policy "campaigns_delete_own" on public.campaigns for delete using (auth.uid() = user_id);

drop policy if exists "messages_all_own" on public.messages;
create policy "messages_all_own" on public.messages for all
  using (exists (select 1 from public.campaigns c where c.id = messages.campaign_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.campaigns c where c.id = messages.campaign_id and c.user_id = auth.uid()));

drop policy if exists "embeddings_all_own" on public.embeddings;
create policy "embeddings_all_own" on public.embeddings for all
  using (exists (select 1 from public.campaigns c where c.id = embeddings.campaign_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.campaigns c where c.id = embeddings.campaign_id and c.user_id = auth.uid()));

drop policy if exists "world_state_all_own" on public.world_state;
create policy "world_state_all_own" on public.world_state for all
  using (exists (select 1 from public.campaigns c where c.id = world_state.campaign_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.campaigns c where c.id = world_state.campaign_id and c.user_id = auth.uid()));

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end$$;

drop trigger if exists trg_campaigns_touch on public.campaigns;
create trigger trg_campaigns_touch before update on public.campaigns
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_world_state_touch on public.world_state;
create trigger trg_world_state_touch before update on public.world_state
  for each row execute function public.touch_updated_at();

create or replace function public.match_embeddings(
  p_campaign_id uuid, p_query_vec vector(1536), p_limit int default 5
) returns table (id uuid, message_id uuid, content text, similarity float)
language sql stable as $$
  select e.id, e.message_id, e.content, 1 - (e.embedding <=> p_query_vec) as similarity
  from public.embeddings e
  where e.campaign_id = p_campaign_id
  order by e.embedding <=> p_query_vec
  limit p_limit;
$$;
```

</details>

4. **Get your keys:** Project Settings → API → copy `Project URL` and `anon public key`
5. **Deploy to Vercel** (click the badge at the top) and set these env vars:

| Env var                          | Required | Purpose                                            |
| -------------------------------- | -------- | -------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`       | ✅ prod  | Supabase project URL                               |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`  | ✅ prod  | Supabase anon key                                  |
| `DATABASE_URL`                   | local only | SQLite file path (Prisma local preview)         |

> The local preview (Prisma + SQLite) is automatically used when `NEXT_PUBLIC_SUPABASE_URL` is unset.

---

## 🧠 How the RAG Memory Pipeline Works

Every time the user sends a message, EchoLore runs this pipeline inside `POST /api/chat`:

1. **Save** the user's message → `messages` table
2. **Embed** the user's message (OpenAI `text-embedding-3-small`) → `embeddings` table
3. **Vector search** (cosine distance) on the `embeddings` table for that `campaign_id` → top 5 most relevant past events
4. **Working memory:** pull the last 5 raw messages from `messages` for immediate context
5. **Compile the mega-prompt** in this exact order (`src/lib/rag/compile-prompt.ts`):
   1. Core directive ("You are an immersive AI roleplayer. Stay in character…")
   2. World description + User Persona + AI Persona (from `campaigns`)
   3. World State (raw JSON from `world_state`)
   4. Retrieved Memories (the 5 vectorized memories, labeled "Past Events")
   5. Working Memory (the last 5 messages — passed as actual chat history)
   6. User Input (the current message — passed as the final user message)
6. **Stream** the compiled prompt to `gpt-4o-mini` via `streamText` from the Vercel AI SDK → the AI reply streams token-by-token to the browser
7. **Save** the full AI reply to `messages` and re-embed it into `embeddings` (so future turns can retrieve it)

### Dynamic Lorebook (background updater)

After every **4th message** in a campaign, EchoLore fires a background call to `gpt-4o-mini`:

> *"You are the lorebook keeper for a roleplay campaign. Based on the recent conversation, has the user's location, inventory, health, or active quests changed? Output ONLY the updated JSON state. Current State: [JSON]. Recent Chat: [last 4 messages]."*

The returned JSON is **upserted** into the `world_state` table for that campaign — so the AI always knows where you are, what you're carrying, and what you're chasing. The lorebook is viewable in the chat header via the **Show lorebook** button.

---

## 🔐 Security Model

- **API key** lives in your browser's `localStorage` only. It is **never** persisted server-side, **never** logged, and **never** stored in the database.
- The key is attached to each API request via the `x-user-api-key` header, read server-side by the Next.js Route Handler, used to call OpenAI, then discarded.
- **Row Level Security** is enabled on every Supabase table. Users can only see and modify rows where `campaigns.user_id = auth.uid()`.
- The local preview uses a mock single-user UUID (stored in `localStorage`). Swap in Supabase Auth for production — the data model already expects it.

---

## 📁 Project Structure

```
EchoLore/
├── supabase/
│   └── schema.sql             # Production PostgreSQL schema (pgvector + RLS)
├── prisma/
│   └── schema.prisma          # Local preview schema (SQLite)
├── src/
│   ├── app/
│   │   ├── page.tsx           # Main app shell (sidebar + chat)
│   │   ├── layout.tsx         # Root layout (dark obsidian+ember theme)
│   │   └── api/
│   │       ├── campaigns/
│   │       │   ├── route.ts        # GET/POST campaigns
│   │       │   └── [id]/route.ts   # GET/DELETE one campaign
│   │       ├── chat/
│   │       │   └── route.ts        # POST — the RAG pipeline + streamText
│   │       ├── messages/
│   │       │   └── [campaignId]/route.ts  # GET message history
│   │       └── lorebook/
│   │           └── [campaignId]/route.ts  # GET current world_state
│   ├── components/
│   │   ├── echolore/
│   │   │   ├── brand.tsx              # Logo + wordmark
│   │   │   ├── sidebar.tsx            # Campaign list
│   │   │   ├── chat-window.tsx        # Streaming chat UI
│   │   │   ├── new-campaign-modal.tsx # "New World" setup flow
│   │   │   └── settings-modal.tsx     # OpenAI API key manager
│   │   └── ui/                # shadcn/ui components
│   ├── hooks/
│   │   ├── use-mock-user.ts   # Mock single-user UUID (swap for Supabase auth)
│   │   └── use-mounted.ts     # React 19-safe hydration guard
│   ├── lib/
│   │   ├── auth.ts                   # Server-side user-id header reader
│   │   ├── db.ts                     # Prisma client
│   │   ├── byok/headers.ts           # BYOK header builder + reader
│   │   └── rag/
│   │       ├── compile-prompt.ts     # The mega-prompt compiler (secret sauce)
│   │       ├── embedding.ts          # OpenAI text-embedding-3-small wrapper
│   │       └── local-vector.ts       # Cosine similarity (local preview)
│   ├── store/
│   │   ├── byok-store.ts      # Zustand+persist: OpenAI key in localStorage
│   │   └── campaign-store.ts  # Zustand: campaign list + active world_state
│   └── types/echolore.ts      # Shared types
└── README.md
```

---

## 🗺️ Roadmap

- [x] Project scaffold (Next.js 16, Tailwind, shadcn/ui)
- [x] Supabase SQL schema (pgvector + RLS)
- [x] Local preview DB (Prisma + SQLite)
- [x] "New World" setup modal (World, User Persona, AI Persona, Starting State)
- [x] Sidebar campaign list
- [x] BYOK settings modal (OpenAI key + model identifiers)
- [x] **RAG message pipeline** (embed → vector search → compile → streamText)
- [x] **Background lorebook updater** (every 4th message)
- [x] Streaming responses (Vercel AI SDK `streamText`)
- [x] Living lorebook viewer in the chat header
- [ ] Supabase auth integration (replace mock user)
- [ ] Mobile sidebar drawer
- [ ] Message editing / regeneration history
- [ ] Multi-provider support (Anthropic, Gemini) — kept simple for v1

---

## 📜 License

MIT — fork it, ship it, mod it. Pull requests welcome.
