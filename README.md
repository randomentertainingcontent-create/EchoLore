# EchoLore

> **BYOK AI roleplay with RAG memory.** Create custom worlds, become anyone, and let an AI Game Master remember every twist — powered by vectorized memories and a dynamic lorebook.

EchoLore is an open-source, Bring-Your-Own-Key roleplay client designed to **max out AI memory** so it feels like real life. Instead of sending the entire chat history to the LLM, EchoLore uses a RAG (Retrieval-Augmented Generation) architecture: it vectorizes past events, dynamically retrieves the most relevant memories, and tracks world state via a JSON lorebook so the AI perfectly remembers your custom universe.

---

## ✨ Features

- **Immersive Game Master AI.** A 120B reasoning model (gpt-oss-120b:free) acts as your Game Master, with a strict anti-chatbot prompt directive — second-person present-tense narration, distinct NPC voices, no breaking character.
- **Build entirely custom worlds.** Define the world, who you are, and the AI's role. The AI adapts to whatever setting you describe — modern slice-of-life, fantasy, sci-fi, horror, romance, anything.
- **RAG memory.** Every message is embedded via OpenRouter. The top 5 most semantically relevant past events are injected into every prompt — so an offhand detail from 200 messages ago can resurface naturally.
- **Working memory.** The last 5 raw messages are always injected for immediate conversational continuity.
- **Dynamic lorebook.** A JSON `world_state` (location, inventory, health, quests, etc.) is auto-updated by a background model call after every 4th message, so the AI never forgets where you are or what you're carrying. View it live via the "Show lorebook" button in the chat header.
- **Streaming responses.** The Game Master's reply streams in token-by-token via the Vercel AI SDK.
- **Markdown rendering.** Game Master replies render `**bold**`, `*italics*`, numbered lists, and blockquotes properly — no raw markdown text.
- **BYOK — Bring Your Own Key.** Paste your OpenRouter API key. It lives in your browser's `localStorage` only — never persisted server-side, never logged. **One key handles chat, lorebook updates, AND embeddings.**
- **Free-tier friendly.** Defaults use `openai/gpt-oss-120b:free` (chat) + `openai/gpt-oss-20b:free` (lorebook) on OpenRouter — try it for $0. Swap to `gpt-4o`, `claude-3.5-sonnet`, or any other model in Settings when you want higher quality.
- **Resilient.** If the stream fails (rate limit, network error), the orphaned user message is automatically cleaned up from the database — no more confused reloads with messages that have no AI reply.
- **Persists across reloads.** Your active campaign, chat history, and API key all survive page reloads via `localStorage`.

---

## 🧱 Tech Stack

| Layer            | Choice                                                                |
| ---------------- | --------------------------------------------------------------------- |
| Frontend         | Next.js 16 (App Router), Tailwind CSS, shadcn/ui                      |
| AI / LLM         | Vercel AI SDK 6 + `@openrouter/ai-sdk-provider`                       |
| Chat model       | `openai/gpt-oss-120b:free` (default — 120B reasoning model, reasoning tokens stripped) |
| Lorebook model   | `openai/gpt-oss-20b:free` (smaller, for background JSON updates)      |
| Embeddings       | `text-embedding-3-small` via OpenRouter (1536-dim, matches pgvector schema) |
| Database         | Supabase (PostgreSQL + pgvector + Row Level Security)                 |

> **Why OpenRouter only?** One signup, one key, hundreds of models (including free ones). OpenRouter routes embedding requests to providers like OpenAI, so the same key handles chat AND the RAG memory layer. Simplicity wins for OSS.

---

## 🚀 Quick Start

### Prerequisites

- Node.js 20+ (or [Bun](https://bun.sh) 1.1+)
- An **OpenRouter** API key → https://openrouter.ai/keys (free tier available, no credit card required)
- A **Supabase** project → https://supabase.com/dashboard (free tier)

### Step 1: Set up Supabase

1. Create a new Supabase project.
2. **Enable pgvector:** Dashboard → Database → Extensions → enable `vector`.
3. **Install the schema:** Dashboard → SQL Editor → New query → paste the entire contents of [`supabase/schema.sql`](./supabase/schema.sql) → click **Run**.
4. **Copy your keys:** Project Settings → API → copy:
   - `Project URL` (looks like `https://yourproject.supabase.co`)
   - `anon public` key (safe to expose in browser)
   - `service_role` secret (SERVER-ONLY — bypasses RLS until real auth is wired up)

### Step 2: Install & run

```bash
git clone https://github.com/randomentertainingcontent-create/EchoLore.git
cd EchoLore
bun install              # or: npm install
cp .env.example .env     # then fill in the three Supabase values from Step 1
bun run dev              # http://localhost:3000
```

Open the app, click **Settings** (top-right), paste your OpenRouter API key, and click **New World** to begin.

### Step 3: Write good prompts

EchoLore now includes **live word counters** on the New World form. If your world/persona descriptions are too short (under 10-15 words), you'll see amber warnings and a confirmation dialog on submit — because thin prompts make the AI improvise a setting that may not match what you imagined.

**Good prompt examples:**

| Field | Bad (too thin) | Good |
|-------|----------------|------|
| World | "just a normal world" | "A modern suburban home on a quiet Tuesday evening. The user is a high school student preparing for finals week." |
| User Persona | "im a boy" | "I'm a 16-year-old high school student. I'm stressed about my math final tomorrow and a bit sleep-deprived." |
| AI Persona | "ur my friend" | "You are my best friend Maya, who came over to study with me. You're supportive, funny, and good at math." |

The AI will adapt to whatever setting your prompts describe — modern, fantasy, sci-fi, horror, romance. If the prompts are ambiguous, the AI asks in-character rather than assuming fantasy.

---

## 🧠 How the RAG Memory Pipeline Works

Every time the user sends a message, EchoLore runs this pipeline inside `POST /api/chat`:

1. **Save** the user's message → `messages` table
2. **Embed** the user's message (OpenRouter `text-embedding-3-small`) → `embeddings` table
3. **Vector search** (cosine distance) via Supabase RPC `match_embeddings` on the `embeddings` table for that `campaign_id` → top 5 most relevant past events
4. **Working memory:** pull the last 5 raw messages from `messages` for immediate context
5. **Compile the mega-prompt** in this exact order (`src/lib/rag/compile-prompt.ts`):
   1. Core directive — 10 absolute rules: never break character, never ask meta questions, always narrate sensory detail, always voice NPCs distinctly, never act for the user, always honor the world state, etc.
   2. Setting inference (only if prompts are thin) — tells the AI to infer a modern/sci-fi/fantasy setting from the persona rather than defaulting to fantasy
   3. World description + User Persona + AI Persona (from `campaigns`)
   4. World State (raw JSON from `world_state`)
   5. Retrieved Memories (the 5 vectorized memories, labeled "Past Events")
   6. Working Memory (the last 5 messages — passed as actual chat history)
   7. User Input (the current message — passed as the final user message)
6. **Stream** the compiled prompt to the OpenRouter chat model via `streamText` from the Vercel AI SDK → the AI reply streams token-by-token to the browser. Reasoning tokens are stripped server-side via `reasoning: { exclude: true }` so the model's inner monologue never leaks into the visible reply.
7. **Save** the full AI reply to `messages` and re-embed it into `embeddings` (so future turns can retrieve it)

### Resilience

If the stream fails (OpenRouter rate limit, invalid key, network error), the `onError` callback automatically deletes the orphaned user message + its embedding from Supabase. This prevents confused reloads where user messages appear with no AI reply.

### Dynamic Lorebook (background updater)

After every **4th message** in a campaign, EchoLore fires a background call to the lorebook model:

> *"You are the lorebook keeper for a roleplay campaign. Based on the recent conversation, has the user's location, inventory, health, or active quests changed? Output ONLY the updated JSON state. Current State: [JSON]. Recent Chat: [last 4 messages]."*

The returned JSON is **upserted** into the `world_state` table for that campaign — so the AI always knows where you are, what you're carrying, and what you're chasing. The lorebook auto-refreshes in the UI 3 seconds after each stream completes.

---

## 🔐 Security Model

- **OpenRouter key** lives in your browser's `localStorage` only. It is **never** persisted server-side, **never** logged, and **never** stored in the database.
- The key is attached to each API request via the `x-openrouter-key` header, read server-side by the Next.js Route Handler, used to call OpenRouter, then discarded.
- **Supabase Row Level Security** is enabled on every table. The `service_role` key bypasses RLS server-side (until real auth is wired up); once you add Supabase Auth, the policies automatically scope every query to `auth.uid() = user_id`.
- **Never commit** the `service_role` key to git. It bypasses all RLS — anyone with it can read/write/delete ALL data in your Supabase project. The `.env` file is gitignored.
- **Input validation** — null bytes are stripped from messages (they break JSON/LLM APIs), starting state must be a JSON object (not array/primitive), and all API routes return clean 4xx errors for invalid input.

---

## 📁 Project Structure

```
EchoLore/
├── supabase/
│   ├── schema.sql             # Production PostgreSQL schema (pgvector + RLS)
│   └── patch-drop-auth-fk.sql # Optional: drop auth.users FK for mock-user mode
├── scripts/
│   ├── stress_test.py         # 10 diverse campaign configs × 3 messages each
│   ├── edge_tests.py          # 38 API validation/edge-case tests
│   └── inspect_messages.py    # Dump all messages from Supabase for review
├── .env.example               # Template — copy to .env and fill in
├── next.config.ts             # Next.js config (no standalone output)
├── src/
│   ├── app/
│   │   ├── page.tsx           # Main app shell (sidebar + chat + lorebook refresh)
│   │   ├── layout.tsx         # Root layout (dark "obsidian + ember" theme)
│   │   ├── globals.css        # Theme tokens + Game Master markdown styles
│   │   └── api/
│   │       ├── setup-check/route.ts       # GET — verifies schema is installed
│   │       ├── campaigns/
│   │       │   ├── route.ts               # GET/POST campaigns (validates starting state)
│   │       │   └── [id]/route.ts          # GET/DELETE one campaign (ownership-checked)
│   │       ├── chat/route.ts              # POST — RAG pipeline + streamText + orphan cleanup
│   │       ├── messages/
│   │       │   └── [campaignId]/route.ts  # GET message history
│   │       └── lorebook/
│   │           └── [campaignId]/route.ts  # GET current world_state
│   ├── components/
│   │   ├── echolore/
│   │   │   ├── brand.tsx                  # Logo + wordmark
│   │   │   ├── sidebar.tsx                # Campaign list (persists activeId)
│   │   │   ├── chat-window.tsx            # Streaming chat UI + markdown rendering
│   │   │   ├── new-campaign-modal.tsx     # "New World" setup (word counters + thin warnings)
│   │   │   └── settings-modal.tsx         # OpenRouter API key + model identifiers
│   │   └── ui/                            # shadcn/ui components
│   ├── hooks/
│   │   ├── use-mock-user.ts   # Mock single-user UUID (swap for Supabase auth)
│   │   └── use-mounted.ts     # React 19-safe hydration guard
│   ├── lib/
│   │   ├── auth.ts            # Server-side user-id header reader
│   │   ├── supabase.ts        # Supabase clients (lazy env var checks)
│   │   ├── byok/headers.ts    # BYOK header builder + reader
│   │   └── rag/
│   │       ├── compile-prompt.ts     # Mega-prompt compiler (anti-chatbot directive + setting inference)
│   │       └── embedding.ts          # OpenRouter embedding wrapper
│   ├── store/
│   │   ├── byok-store.ts      # Zustand+persist: OpenRouter key + models (v5, auto-migrates)
│   │   └── campaign-store.ts  # Zustand+persist: campaign list + activeId (survives reload)
│   └── types/echolore.ts      # Shared types
└── README.md
```

---

## 🗺️ Roadmap

**Done:**
- [x] Project scaffold (Next.js 16, Tailwind, shadcn/ui)
- [x] Supabase SQL schema (pgvector + RLS)
- [x] Supabase JS client (no Prisma — clean Vercel builds)
- [x] "New World" setup modal with live word counters + thin-prompt warnings
- [x] 4 rich presets (Cyberpunk Neon, Dragon Realm, Deep Space, Cozy Mystery)
- [x] Sidebar campaign list (persists active campaign across reloads)
- [x] BYOK settings modal (OpenRouter key + chat/lore model identifiers)
- [x] RAG message pipeline (embed → vector search → compile → streamText)
- [x] Background lorebook updater (every 4th message)
- [x] Streaming responses (Vercel AI SDK `streamText`)
- [x] Living lorebook viewer in the chat header (auto-refreshes after stream)
- [x] Markdown rendering for Game Master replies (bold, italics, lists, blockquotes)
- [x] 120B reasoning model default with reasoning tokens stripped
- [x] Anti-chatbot prompt directive (10 absolute rules)
- [x] Setting inference for thin prompts (modern vs fantasy vs sci-fi)
- [x] Setup-check endpoint with friendly error if schema isn't installed
- [x] Orphan message cleanup on stream failure
- [x] Page reload persistence (active campaign + chat history + API key)
- [x] 38 API edge-case tests passing (auth, validation, special chars, null bytes, etc.)

**TODO:**
- [ ] Supabase Auth integration (replace mock user + service_role key, let RLS do its job)
- [ ] Mobile sidebar drawer
- [ ] Message editing / regeneration history
- [ ] OpenRouter model picker UI with price/quality hints
- [ ] Collapsible "retrieved memories" panel (transparency into RAG)
- [ ] Keyboard shortcut: Cmd/Ctrl+K to focus composer
- [ ] Syntax-highlighted lorebook JSON viewer

---

## 🧪 Testing

The repo includes test scripts in `scripts/`:

```bash
# Run the 38 edge-case tests (fast, no LLM calls needed)
python3 scripts/edge_tests.py

# Inspect all messages in your Supabase project
python3 scripts/inspect_messages.py

# Run the full stress test (10 campaigns × 3 messages — slow, uses LLM)
OPENROUTER_KEY=sk-or-v1-... python3 scripts/stress_test.py
```

The edge-case tests cover: auth (missing/empty user-id), validation (missing/empty required fields), not-found (nonexistent IDs), special characters (emoji, RTL text, HTML, SQL injection, newlines, tabs, null bytes, unicode), starting state validation (arrays/primitives rejected), and message content edge cases.

---

## 📜 License

MIT — fork it, ship it, mod it. Pull requests welcome.
