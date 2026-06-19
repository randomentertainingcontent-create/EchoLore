# EchoLore — Worklog

---
Task ID: foundation-1
Agent: main (Super Z)
Task: Scaffold the EchoLore Next.js project, write the production Supabase SQL schema (pgvector), and build the "New Campaign" setup UI, sidebar shell, BYOK settings modal, and chat window placeholder. Dark "obsidian + ember" theme. Gemini default provider. Mock single-user. Prisma+SQLite for local preview.

Work Log:
- Initialized Next.js 16 + TS + Tailwind 4 + shadcn/ui scaffold via the fullstack-dev skill's init script. Dev server confirmed live on port 3000.
- Wrote `prisma/schema.prisma` (SQLite) mirroring the production Supabase schema 1:1 — Campaign / Message / Embedding / WorldState. SQLite stores embeddings as JSON (`Float[]`) since it lacks a native vector type; cosine similarity will be computed in JS for the local preview.
- Ran `bun run db:push` → SQLite database created at `db/custom.db`.
- Wrote `supabase/schema.sql` — production PostgreSQL + pgvector schema. Enables the `vector` extension, creates all four tables with proper FKs, indexes (including HNSW for vector similarity search), RLS policies so each user only sees their own data, an `updated_at` trigger, and a convenience `match_embeddings()` SQL function. Single copy-paste block.
- Defined the "Obsidian + Ember" theme in `src/app/globals.css`: deep slate/zinc backgrounds (`oklch(0.155 0.012 250)`), warm amber primary (`oklch(0.74 0.18 55)`), custom scrollbar, ember radial-glow background utility, and pulsing "AI awake" dot.
- Built the type system in `src/types/echolore.ts`: Campaign, Message, WorldState, ByokConfig, LlmProvider, NewCampaignInput.
- Built the BYOK store (`src/store/byok-store.ts`): Zustand + persist, default provider is Gemini (free tier for OSS adoption). Chat/lore/embed model identifiers stored alongside keys. Keys live ONLY in localStorage.
- Built the campaign store (`src/store/campaign-store.ts`): list/create/delete + active campaign hydration (fetches the campaign's current world_state on selection).
- Built `useMockUser` hook (`src/hooks/use-mock-user.ts`) using `useSyncExternalStore` (React 19-safe). Generates a stable UUID on first visit, stored in localStorage. Server-side equivalent in `src/lib/auth.ts` (reads `x-user-id` header).
- Built `useMounted` hook (`src/hooks/use-mounted.ts`) — same `useSyncExternalStore` pattern, used anywhere a hydration guard is needed.
- Built BYOK header helpers (`src/lib/byok/headers.ts`): `buildByokHeaders()` on client, `readByokHeaders()` on server. Keys travel via `x-user-api-key`, `x-llm-provider`, `x-chat-model`, `x-lore-model`, `x-embed-model`.
- Built the API routes: `POST/GET /api/campaigns` and `GET/DELETE /api/campaigns/[id]`. Both validate the `x-user-id` header, scope queries to that user, and use Prisma. POST also seeds the initial `world_state` row (either the user-supplied JSON or `{}`).
- Built the UI components in `src/components/echolore/`:
  - `brand.tsx` — EchoLore flame-with-echo-ripples SVG logo + wordmark.
  - `sidebar.tsx` — Brand header, "New World" button, scrollable campaign list (with title, world description peek, msg count, last-updated, per-row delete menu), and a footer with a Settings button + "keys in browser only" reminder. The pulse dot at the top turns ember when a key is active.
  - `new-campaign-modal.tsx` — The centerpiece. Two tabs (Blank / Presets) with four rich presets (Cyberpunk Neon, Dragon Realm, Deep Space, Cozy Mystery). Required fields: Title, World Description, User Persona, AI Persona. Optional Starting State as a JSON editor with live validation. Submit button labeled "Light the fire".
  - `settings-modal.tsx` — BYOK manager. Tabs for Gemini / OpenAI / Anthropic. Each panel has a masked/unmasked password-style key input, a "Get a key" link, the active-provider model identifier fields (chat + lorebook), and a reset-to-defaults button. Security note explains storage + the embedding-key caveat (OpenAI key needed regardless of chat provider).
  - `chat-window.tsx` — Empty state for new users (welcome hero with three feature cards). When a campaign is selected: header with title + world description + lorebook badge, persona chip strip (You are / AI is), the disabled composer with a 7-step pipeline preview (intentionally disabled — RAG wiring comes next iteration), and an ember-glow background.
- Wired it all together in `src/app/page.tsx` — sidebar + chat split layout, mobile top bar fallback, modals, first-visit Settings auto-open nudge, and campaign store hydration on selection.
- Fixed React 19 lint rule violations (`react-hooks/set-state-in-effect`) by replacing the `useEffect(() => setMounted(true), [])` pattern with a `useSyncExternalStore`-based `useMounted` hook in three files.
- Fixed a client/server boundary violation: moved `getUserIdFromHeaders` out of the `"use client"` hook file into a server-safe `src/lib/auth.ts`. Verified via curl that `GET /api/campaigns` (no header) → 401, with header → 200 `[]`, POST → 201 with world_state seeded, DELETE → 200.
- Wrote `README.md` with the "Deploy to Vercel" button at the very top, the dual-layer architecture explanation, Quick Start for local preview, a collapsible full SQL schema copy-paste block, the RAG pipeline explanation, security model, project structure, and a roadmap checklist.
- Verified end-to-end with Agent Browser: page loads, Settings modal auto-opens on first visit, New Campaign modal opens, presets fill all fields, submit creates the campaign and shows a success toast, the campaign appears in the sidebar with correct metadata, the chat window switches to the campaign view, the BYOK sidebar indicator updates when a key is pasted, and mobile viewport (375×812) shows the responsive top bar. Zero runtime errors in console.

Stage Summary:
- Foundation complete and browser-verified. The repo now contains: scaffold, Prisma schema, Supabase SQL schema, dark obsidian+ember theme, BYOK store + settings modal, mock single-user system, sidebar with campaign CRUD, the full "New World" setup modal with 4 rich presets + live JSON validation, and a chat window placeholder showing the upcoming RAG pipeline. The README has a working "Deploy to Vercel" button. All lint passes. Dev server log is clean (HTTP 200/201 across all routes).
- Next iteration: wire up the actual RAG message pipeline (embed → vector search → compile mega-prompt → stream via Vercel AI SDK) and the background lorebook updater (every 4th message).
