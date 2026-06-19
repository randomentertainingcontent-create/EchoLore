# EchoLore

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Frandomentertainingcontent-create%2FEchoLore&env=NEXT_PUBLIC_SUPABASE_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY,SUPABASE_SERVICE_ROLE_KEY&envDescription=Supabase%20project%20URL%2C%20anon%20key%2C%20and%20service_role%20key%20(see%20README%20for%20setup)&project-name=echolore&repository-name=echolore)

> **BYOK AI roleplay with RAG memory.** Create custom worlds, become anyone, and let an AI Game Master remember every twist — powered by vectorized memories and a dynamic lorebook. OpenRouter for chat + embeddings, Supabase + pgvector for storage.

EchoLore is an open-source, Bring-Your-Own-Key roleplay client designed to **max out AI memory** so it feels like real life. Instead of sending the entire chat history to the LLM, EchoLore uses a RAG (Retrieval-Augmented Generation) architecture: it vectorizes past events, dynamically retrieves the most relevant memories, and tracks world state via a JSON lorebook so the AI perfectly remembers your custom universe.

---

## ✨ Features

- **Build entirely custom worlds.** Define the world, who you are, and the AI's role. The AI acts as a dynamic Game Master / Storyteller.
- **RAG memory.** Every message is embedded via OpenRouter. The top 5 most semantically relevant past events are injected into every prompt — so an offhand detail from 200 messages ago can resurface naturally.
- **Working memory.** The last 5 raw messages are always injected for immediate conversational continuity.
- **Dynamic lorebook.** A JSON `world_state` (location, inventory, health, quests, etc.) is auto-updated by a background model call after every 4th message, so the AI never forgets where you are or what you're carrying.
- **Streaming responses.** The Game Master's reply streams in token-by-token via the Vercel AI SDK.
- **BYOK — Bring Your Own Key.** Paste your OpenRouter API key. It lives in your browser's `localStorage` only — never persisted server-side, never logged. **One key handles chat, lorebook updates, AND embeddings.**
- **Free-tier friendly.** Defaults use `meta-llama/llama-3.2-3b-instruct:free` on OpenRouter — try it for $0. Swap to `gpt-4o-mini` or `claude-3.5-sonnet` in Settings when you want higher quality.
- **One-click Vercel deploy.** Click the badge above, paste your Supabase keys, and you're live.

---

## 🧱 Tech Stack

| Layer            | Choice                                                                |
| ---------------- | --------------------------------------------------------------------- |
| Frontend         | Next.js 16 (App Router), Tailwind CSS, shadcn/ui                      |
| AI / LLM         | Vercel AI SDK 6 + `@openrouter/ai-sdk-provider`                       |
| Embeddings       | OpenRouter (default: `text-embedding-3-small`, 1536-dim)              |
| Database         | Supabase (PostgreSQL + pgvector + RLS)                                |
| Hosting          | Vercel                                                                |

> **Why OpenRouter only?** One signup, one key, hundreds of models (including free ones). OpenRouter routes embedding requests to providers like OpenAI, so the same key handles chat AND the RAG memory layer. Simplicity wins for OSS.

---

## 🚀 Quick Start

### Prerequisites

- Node.js 20+ (or [Bun](https://bun.sh) 1.1+)
- An **OpenRouter** API key → https://openrouter.ai/keys (free tier available)
- A **Supabase** project → https://supabase.com/dashboard (free tier)

### Step 1: Set up Supabase

1. Create a new Supabase project.
2. **Enable pgvector:** Dashboard → Database → Extensions → enable `vector`.
3. **Install the schema:** Dashboard → SQL Editor → New query → paste the entire contents of [`supabase/schema.sql`](./supabase/schema.sql) → click **Run**.
4. **Copy your keys:** Project Settings → API → copy:
   - `Project URL` (looks like `https://yourproject.supabase.co`)
   - `anon public` key (safe to expose in browser)
   - `service_role` secret (SERVER-ONLY — bypasses RLS)

### Step 2: Install & run

```bash
git clone https://github.com/randomentertainingcontent-create/EchoLore.git
cd EchoLore
bun install              # or: npm install
cp .env.example .env     # then fill in the three Supabase values from Step 1
bun run dev              # http://localhost:3000
```

Open the app, click **Settings** (top-right), paste your OpenRouter API key, and click **New World** to begin.

---

## 🗄️ Production Setup (Vercel)

Click the **Deploy to Vercel** badge at the top of this README. When prompted, set these env vars (find them all in your Supabase dashboard → Project Settings → API):

| Env var                          | Required | Purpose                                                     |
| -------------------------------- | -------- | ---------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`       | ✅       | Supabase project URL (e.g. `https://x.supabase.co`)        |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`  | ✅       | Supabase anon key — safe to expose in the browser          |
| `SUPABASE_SERVICE_ROLE_KEY`      | ✅       | Supabase service_role key — SERVER ONLY, bypasses RLS      |

> **Important:** Never prefix the service_role key with `NEXT_PUBLIC_`. It bypasses all Row Level Security. The repo uses it server-side only until Supabase Auth is wired up — once you add real auth, you can drop it and let RLS do its job.

---

## 🧠 How the RAG Memory Pipeline Works

Every time the user sends a message, EchoLore runs this pipeline inside `POST /api/chat`:

1. **Save** the user's message → `messages` table
2. **Embed** the user's message (OpenRouter `text-embedding-3-small`) → `embeddings` table
3. **Vector search** (cosine distance) via Supabase RPC `match_embeddings` on the `embeddings` table for that `campaign_id` → top 5 most relevant past events
4. **Working memory:** pull the last 5 raw messages from `messages` for immediate context
5. **Compile the mega-prompt** in this exact order (`src/lib/rag/compile-prompt.ts`):
   1. Core directive ("You are an immersive AI roleplayer. Stay in character…")
   2. World description + User Persona + AI Persona (from `campaigns`)
   3. World State (raw JSON from `world_state`)
   4. Retrieved Memories (the 5 vectorized memories, labeled "Past Events")
   5. Working Memory (the last 5 messages — passed as actual chat history)
   6. User Input (the current message — passed as the final user message)
6. **Stream** the compiled prompt to the OpenRouter chat model via `streamText` from the Vercel AI SDK → the AI reply streams token-by-token to the browser
7. **Save** the full AI reply to `messages` and re-embed it into `embeddings` (so future turns can retrieve it)

### Dynamic Lorebook (background updater)

After every **4th message** in a campaign, EchoLore fires a background call to the lorebook model:

> *"You are the lorebook keeper for a roleplay campaign. Based on the recent conversation, has the user's location, inventory, health, or active quests changed? Output ONLY the updated JSON state. Current State: [JSON]. Recent Chat: [last 4 messages]."*

The returned JSON is **upserted** into the `world_state` table for that campaign — so the AI always knows where you are, what you're carrying, and what you're chasing. The lorebook is viewable in the chat header via the **Show lorebook** button.

---

## 🔐 Security Model

- **OpenRouter key** lives in your browser's `localStorage` only. It is **never** persisted server-side, **never** logged, and **never** stored in the database.
- The key is attached to each API request via the `x-openrouter-key` header, read server-side by the Next.js Route Handler, used to call OpenRouter, then discarded.
- **Supabase Row Level Security** is enabled on every table. The included `service_role` key bypasses RLS server-side (until real auth is wired up); once you add Supabase Auth, the policies automatically scope every query to `auth.uid() = user_id`.
- **Never commit** the `service_role` key to git. It bypasses all RLS — anyone with it can read/write/delete ALL data in your Supabase project.

---

## 📁 Project Structure

```
EchoLore/
├── supabase/
│   └── schema.sql             # Production PostgreSQL schema (pgvector + RLS)
├── .env.example               # Template — copy to .env and fill in
├── vercel.json                # Vercel build config
├── next.config.ts             # Next.js config (no standalone output — Vercel-friendly)
├── src/
│   ├── app/
│   │   ├── page.tsx           # Main app shell (sidebar + chat)
│   │   ├── layout.tsx         # Root layout (dark obsidian+ember theme)
│   │   └── api/
│   │       ├── setup-check/route.ts       # GET — verifies schema is installed
│   │       ├── campaigns/
│   │       │   ├── route.ts               # GET/POST campaigns
│   │       │   └── [id]/route.ts          # GET/DELETE one campaign
│   │       ├── chat/route.ts              # POST — the RAG pipeline + streamText
│   │       ├── messages/
│   │       │   └── [campaignId]/route.ts  # GET message history
│   │       └── lorebook/
│   │           └── [campaignId]/route.ts  # GET current world_state
│   ├── components/
│   │   ├── echolore/
│   │   │   ├── brand.tsx                  # Logo + wordmark
│   │   │   ├── sidebar.tsx                # Campaign list
│   │   │   ├── chat-window.tsx            # Streaming chat UI
│   │   │   ├── new-campaign-modal.tsx     # "New World" setup flow
│   │   │   └── settings-modal.tsx         # OpenRouter API key manager
│   │   └── ui/                # shadcn/ui components
│   ├── hooks/
│   │   ├── use-mock-user.ts   # Mock single-user UUID (swap for Supabase auth)
│   │   └── use-mounted.ts     # React 19-safe hydration guard
│   ├── lib/
│   │   ├── auth.ts            # Server-side user-id header reader
│   │   ├── supabase.ts        # Supabase clients (server admin + browser)
│   │   ├── byok/headers.ts    # BYOK header builder + reader
│   │   └── rag/
│   │       ├── compile-prompt.ts     # The mega-prompt compiler (secret sauce)
│   │       └── embedding.ts          # OpenRouter embedding wrapper
│   ├── store/
│   │   ├── byok-store.ts      # Zustand+persist: OpenRouter key in localStorage
│   │   └── campaign-store.ts  # Zustand: campaign list + active world_state
│   └── types/echolore.ts      # Shared types
└── README.md
```

---

## 🗺️ Roadmap

- [x] Project scaffold (Next.js 16, Tailwind, shadcn/ui)
- [x] Supabase SQL schema (pgvector + RLS)
- [x] Supabase JS client (no Prisma — Vercel-friendly)
- [x] "New World" setup modal (World, User Persona, AI Persona, Starting State)
- [x] Sidebar campaign list
- [x] BYOK settings modal (OpenRouter key + model identifiers)
- [x] **RAG message pipeline** (embed → vector search → compile → streamText)
- [x] **Background lorebook updater** (every 4th message)
- [x] Streaming responses (Vercel AI SDK `streamText`)
- [x] Living lorebook viewer in the chat header
- [x] Setup-check endpoint with friendly error if schema isn't installed
- [ ] Supabase auth integration (replace mock user + service_role key)
- [ ] Mobile sidebar drawer
- [ ] Message editing / regeneration history
- [ ] OpenRouter model picker with price/quality hints

---

## 📜 License

MIT — fork it, ship it, mod it. Pull requests welcome.
