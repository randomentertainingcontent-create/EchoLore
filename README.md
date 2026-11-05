# EchoLore

**Stories that remember.** EchoLore is an open-source, bring-your-own-key roleplay app. Build any world, pick who you are, and play it out with an AI narrator that keeps track of where you are, what you carry, who you've met and what you promised.

Instead of stuffing the whole chat into every request, EchoLore combines three kinds of memory:

1. **Working memory**: the most recent messages, verbatim.
2. **Recall**: every message is embedded, and the most relevant past moments are retrieved by meaning (pgvector), so a detail from 200 messages ago can come back.
3. **The lorebook**: a JSON record of the world state that a background "keeper" model updates every couple of turns, and that you can read and edit.

---

## What you can do

**Play**
- **Do / Say / Direct** moves. *Do* describes an action, *Say* wraps your words in quotes, *Direct* steers the story out of character ("skip to nightfall", "make this scene tense") without the narrator acknowledging it.
- **Begin the story** with one click, then use quick actions: **Continue**, **Retry reply** and **Twist**.
- **Regenerate** the last reply, **edit** any message (yours or the narrator's; memory is re-embedded), or **rewind** to any of your moves and rewrite it.
- **Stop** a reply mid-sentence and keep what was written so far.
- **Export** a story as Markdown.

**Build worlds**
- 11 hand-made templates (cyberpunk, high fantasy, sci-fi horror, cozy mystery, slice of life, gothic horror, post-apocalyptic, 1940s noir, pirates, superhero academy, slow-burn romance), a blank page, or "Surprise me".
- Simple starting details (location, inventory, goal) or full JSON for power users.
- Edit a world's setting, your character or the narrator at any time; **duplicate** a world to branch a story.
- The narrator adapts to the role you give it: a second-person Game Master, or a specific character who talks to you in first person.

**The lorebook**
- A readable view of the world state: health-style meters, item chips and nested sections, with a JSON editor for direct changes.
- A pulsing dot shows when the keeper is updating it after a reply.

**Make it yours**
- Pick any OpenRouter model from a searchable live catalogue with prices, context sizes and a free-only filter.
- **Test key** checks your OpenRouter key and shows its credit status.
- Storytelling settings: reply length (short / medium / long), creativity, book-serif or sans reading font, and four text sizes.
- Works on phones: drawer navigation, a lorebook sheet, safe-area padding and large touch targets.

**Design**
The interface is built around a night-camp theme: a hand-drawn pixel-art campfire (animated with stepped CSS frames), a 5×7 bitmap wordmark, pixel sigils for every genre and a pixel starfield, all drawn as crisp SVG in [`pixel-art.tsx`](./src/components/echolore/pixel-art.tsx). Player moves read like a script rather than chat bubbles, and switching worlds uses the browser's native View Transitions. Animations respect `prefers-reduced-motion`.

---

## Tech stack

| Layer          | Choice |
| -------------- | ------ |
| Frontend       | Next.js 16 (App Router), React 19, Tailwind CSS 4, shadcn/ui, Zustand |
| AI             | Vercel AI SDK 6 + `@openrouter/ai-sdk-provider` |
| Story model    | `openai/gpt-oss-120b:free` by default (any OpenRouter model works) |
| Lorebook model | `openai/gpt-oss-20b:free` by default |
| Embeddings     | `openai/text-embedding-3-small` via OpenRouter (1536 dimensions, fixed) |
| Database/auth  | Supabase: PostgreSQL + pgvector + anonymous Auth + Row Level Security |

One OpenRouter key powers the story, the lorebook keeper and memory embeddings.

---

## Quick start

### Prerequisites
- Node.js 20+ (or Bun 1.1+)
- An OpenRouter API key: https://openrouter.ai/keys (free models need no credit)
- A Supabase project: https://supabase.com/dashboard (free tier is fine)

### 1. Set up Supabase
1. Create a project and enable the `vector` extension (Database → Extensions).
2. In the SQL Editor run [`supabase/schema.sql`](./supabase/schema.sql), then [`supabase/hardening.sql`](./supabase/hardening.sql). The app needs the transactional functions from `hardening.sql`; `schema.sql` alone is not enough. For an existing EchoLore database, back it up and apply `hardening.sql`.
3. Turn on **Allow anonymous sign-ins** (Authentication → Sign In / Providers). There is no sign-up form: each browser gets a private guest account automatically, and row-level security keeps its worlds to itself.
4. Copy the project URL and the **anon** public key. Never use the service-role key: every request runs as the signed-in user with RLS enforced.

No extra migration is needed for this release: regenerate, rewind, message edits, world edits and lorebook edits all use the existing tables and their row-level security policies.

### 2. Install and run
```bash
git clone https://github.com/randomentertainingcontent-create/EchoLore.git
cd EchoLore
npm install            # or: bun install
cp .env.example .env.local
npm run dev            # http://localhost:3000
```

Fill `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local` (PowerShell: `Copy-Item .env.example .env.local`). Restart the dev server after changing environment variables; production builds need a rebuild.

### 3. Play
Open the app (no account needed), pick a template or start from scratch, add your OpenRouter key from the banner or **Settings**, and press **Begin the story**.

Guest worlds belong to that browser. Clearing its site data, or switching browsers or devices, means starting fresh.

If the app says "The fire won’t light", anonymous sign-ins are off or the Supabase project is paused. If world creation reports incomplete database setup, check that `hardening.sql` finished. If permissions are denied, check authenticated grants and RLS policies. Don't disable auth or RLS to work around errors.

---

## How a turn works (`POST /api/chat`)

1. Verify the Supabase session and that the world belongs to the user.
2. Take the world's **generation lease**, so two replies (or a reply and a rewind) can never interleave.
3. Load the lorebook and up to 16 recent messages (bounded to ~24k characters) as working memory.
4. Embed the player's move and fetch the top 5 similar past messages, dropping any already in working memory and anything below 0.2 similarity. Recalled memories are labelled by speaker and ordered oldest first.
5. Compile the prompt ([`compile-prompt.ts`](./src/lib/rag/compile-prompt.ts)): roleplay rules, setting inference for thin prompts, the world and both personas, the lorebook, recalled events and the chosen reply length.
6. Stream the reply. Reasoning tokens are excluded.
7. Save the move and the reply atomically with their embeddings (`complete_generation`). If the player presses **Stop**, the partial reply is saved instead.
8. After the response has finished streaming, and every 4th stored message, the lorebook keeper updates the world state in the background, then the lease is released. The client shows "Updating" and refreshes the lorebook when it lands.

Provider errors become actionable messages (bad key, out of credits, rate-limited free model, unknown model, timeouts). If a previous reply still holds the lease, the client waits and retries automatically instead of failing.

### API

| Route | Methods | Purpose |
| ----- | ------- | ------- |
| `/api/campaigns` | GET, POST | List and create worlds |
| `/api/campaigns/[id]` | GET, PATCH, DELETE | Read (with lorebook), edit, delete a world |
| `/api/messages/[campaignId]` | GET, PATCH, DELETE `?from=<id>` | History, edit a message, rewind from a message |
| `/api/lorebook/[campaignId]` | GET, PUT | Read or replace the lorebook |
| `/api/chat` | POST | Generate the next reply (streaming) |
| `/api/models` | GET | OpenRouter text-model catalogue (cached for an hour) |
| `/api/key-check` | POST | Verify an OpenRouter key and report credit status |
| `/api/setup-check` | GET | Check the database schema is installed |

All routes require a Supabase bearer token and validate input with Zod.

---

## Security model
- Every browser gets its own Supabase guest (anonymous) user, so nobody needs to sign up and nobody can read another browser's worlds.
- The OpenRouter key lives in the browser's `localStorage`, is sent per request in the `x-openrouter-key` header, used for that call and discarded. It's never stored server-side or logged.
- The server talks to Supabase with the user's own access token and the anon key, so row-level security scopes every query to the owner.
- Request bodies are size-limited and parsed strictly; lorebook JSON is bounded (6 levels deep, 100 keys per object, 4,000 characters per value, 16 KB total).
- Composer drafts are kept in memory only.

---

## Project structure
```
src/
├── app/
│   ├── page.tsx                  # Landing/sign-in and the signed-in app shell
│   ├── globals.css               # Theme tokens, story typography, pixel-art animation
│   └── api/                      # Route handlers (see the API table above)
│       └── _lib/                 # Validation, generation lease, provider error mapping
├── components/echolore/
│   ├── chat-window.tsx           # Story view, composer (Do/Say/Direct), quick actions, rewind
│   ├── message-item.tsx          # Message rendering, dialogue highlighting, edit/copy/regenerate
│   ├── lorebook-panel.tsx        # Structured lorebook view and JSON editor
│   ├── new-campaign-modal.tsx    # Template gallery and world wizard
│   ├── edit-world-modal.tsx      # Edit an existing world
│   ├── settings-modal.tsx        # Connection, models and storytelling settings
│   ├── model-picker.tsx          # Searchable OpenRouter model catalogue
│   ├── sidebar.tsx               # World list, search, duplicate/delete, account
│   ├── presets.ts                # World templates
│   └── pixel-art.tsx             # Pixel campfire, wordmark and genre sigils (SVG)
├── lib/
│   ├── rag/                      # Prompt compiler and embeddings
│   ├── byok/headers.ts           # BYOK header building and validation
│   └── supabase.ts, auth.ts      # Per-request Supabase clients and session checks
└── store/                        # Zustand stores: worlds, API key, preferences
supabase/
├── schema.sql                    # Tables, pgvector index, RLS
└── hardening.sql                 # Leases, transactional functions, constraints
tests/
├── backend.test.ts               # Route and validation unit tests (no network)
└── e2e/                          # Playwright flows against fully mocked services
```

---

## Testing
```bash
npm run typecheck
npm run lint
npm test                 # unit tests, no network
npm run test:e2e         # Playwright, desktop + mobile, all services mocked
```

The E2E suite covers the guest session, world creation, streaming, failure recovery, templates, Say mode, regenerate, rewind, message edits, lorebook editing, world edits, the model picker, key checks and reload persistence. Playwright defaults to Microsoft Edge; set `PLAYWRIGHT_CHANNEL=chrome` or point `PLAYWRIGHT_EXECUTABLE_PATH` at a Chromium binary. `SCREENS=1 npm run test:e2e -- zz-screens` captures screenshots of every major screen for visual review.

`scripts/` also has Python stress and edge-case scripts for a live deployment.

---

## Roadmap
- Character card import (SillyTavern V2 JSON/PNG)
- Multiple alternate replies ("swipes") per turn
- A collapsible "what the narrator remembered" panel for each reply
- Optional light theme

## License
MIT. Fork it, ship it, mod it. Pull requests welcome.
