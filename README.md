# EchoLore

**Stories that remember.** EchoLore is an open-source, bring-your-own-key roleplay app. Build any world, pick who you are, and play it out with an AI narrator that keeps track of where you are, what you carry, who you've met and what you promised.

**No accounts, no database.** Everything is saved in your browser. The server only relays requests to OpenRouter with your own key and stores nothing.

Instead of stuffing the whole chat into every request, EchoLore combines three kinds of memory:

1. **Working memory**: the most recent messages, verbatim.
2. **Recall**: every message is embedded and the most relevant past moments are found by meaning, right in your browser, so a detail from 200 messages ago can come back.
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
| Storage        | IndexedDB in the browser (worlds, messages, memory vectors, lorebooks) |
| AI             | Vercel AI SDK 6 + `@openrouter/ai-sdk-provider` |
| Story model    | `openai/gpt-oss-120b:free` by default (any OpenRouter model works) |
| Lorebook model | `openai/gpt-oss-20b:free` by default |
| Embeddings     | `openai/text-embedding-3-small` via OpenRouter (1536 dimensions, fixed) |

One OpenRouter key powers the story, the lorebook keeper and memory embeddings.

---

## Quick start

You need Node.js 20+ and, to play, an OpenRouter API key from https://openrouter.ai/keys (free models need no credit). There's nothing else to set up: no database, no environment variables.

```bash
git clone https://github.com/randomentertainingcontent-create/EchoLore.git
cd EchoLore
npm install
npm run dev            # http://localhost:3000
```

Open the app, pick a template (or start from scratch), add your OpenRouter key from the banner or **Settings**, and press **Begin the story**.

**Deploying:** import the repo into Vercel (or any Node host) and deploy. No configuration is needed.

### Your data
Worlds live in the browser you play in. Clearing that browser's site data, using private mode, or switching devices means starting fresh, so use **Settings → Data → Download backup** now and then. **Restore backup** brings worlds back (on any device), and **Erase all data** wipes this browser.

---

## How a turn works

1. **In the browser:** take up to 16 recent messages (bounded to ~24k characters) as working memory, embed the player's move through `POST /api/embed`, and find the 5 most similar older messages in IndexedDB by cosine similarity. Anything already in working memory, or below 0.2 similarity, is skipped.
2. **`POST /api/chat`** receives the world, the lorebook, working memory, recalled memories and the move. It compiles the prompt ([`compile-prompt.ts`](./src/lib/rag/compile-prompt.ts)): roleplay rules, setting inference for thin prompts, the world and both personas, the lorebook, recalled events (speaker-labelled, oldest first) and the chosen reply length. It then streams the reply from OpenRouter. Reasoning tokens are excluded, and the route stores nothing.
3. **In the browser:** the move and the reply are saved to IndexedDB, and the reply is embedded for future recall. If the player presses **Stop**, the partial reply is saved instead.
4. Every 4th stored message, the browser sends the lorebook and recent messages to **`POST /api/lore`**, and saves the updated state the keeper returns. The Lorebook button pulses while it works.

Regenerate, rewind and edits are instant local operations. Provider errors become actionable messages (bad key, out of credits, rate-limited free model, unknown model, timeouts).

### API (all stateless)

| Route | Method | Purpose |
| ----- | ------ | ------- |
| `/api/chat` | POST | Stream the next reply |
| `/api/embed` | POST | Memory vectors for story text |
| `/api/lore` | POST | Updated lorebook state from recent messages |
| `/api/models` | GET | OpenRouter text-model catalogue (cached for an hour) |
| `/api/key-check` | POST | Verify an OpenRouter key and report credit status |

Routes that call OpenRouter need the player's key in the `x-openrouter-key` header. Request bodies are size-limited and validated strictly with Zod.

---

## Privacy and security
- No accounts and no server-side storage. Stories, lorebooks and memory stay in the browser's IndexedDB.
- The OpenRouter key is kept in the browser's `localStorage`, sent with each request in a header, used for that call and discarded. It's never stored or logged on the server.
- Story text is sent to OpenRouter (and the model provider you choose) to generate replies, as with any AI chat app.
- Lorebook JSON is bounded (6 levels deep, 100 keys per object, 4,000 characters per value, 16 KB total), and backups are validated before they're restored.

---

## Project structure
```
src/
├── app/
│   ├── page.tsx                  # App shell
│   ├── globals.css               # Theme tokens, story typography, pixel-art animation
│   └── api/                      # Stateless routes: chat, embed, lore, models, key-check
│       └── _lib/                 # Validation and provider error mapping
├── components/echolore/
│   ├── chat-window.tsx           # Story view, composer (Do/Say/Direct), quick actions, rewind
│   ├── message-item.tsx          # Message rendering, dialogue highlighting, edit/copy/regenerate
│   ├── lorebook-panel.tsx        # Structured lorebook view and JSON editor
│   ├── new-campaign-modal.tsx    # Template gallery and world wizard
│   ├── edit-world-modal.tsx      # Edit an existing world
│   ├── settings-modal.tsx        # Connection, models, storytelling and data (backup/restore)
│   ├── model-picker.tsx          # Searchable OpenRouter model catalogue
│   ├── sidebar.tsx               # World list, search, duplicate/delete
│   ├── presets.ts                # World templates
│   └── pixel-art.tsx             # Pixel campfire, wordmark and genre sigils (SVG)
├── lib/
│   ├── local-db.ts               # IndexedDB storage, backups, local memory search
│   ├── story-client.ts           # Browser calls to /api/embed and /api/lore
│   ├── rag/                      # Prompt compiler and embeddings
│   └── byok/headers.ts           # BYOK header building and validation
└── store/                        # Zustand stores: worlds, API key, preferences
tests/
├── backend.test.ts               # Route, validation, recall and backup unit tests (no network)
└── e2e/                          # Playwright flows against mocked OpenRouter routes
```

---

## Testing
```bash
npm run typecheck
npm run lint
npm test                 # unit tests, no network
npm run test:e2e         # Playwright, desktop + mobile, model routes mocked
```

The E2E suite covers world creation, streaming, reload persistence, failure recovery, templates, Say mode, memory and working-memory payloads, regenerate, rewind, message edits, the lorebook keeper and editor, world edits, the model picker, key checks, and backup/erase/restore. Playwright defaults to Microsoft Edge; set `PLAYWRIGHT_CHANNEL=chrome` or point `PLAYWRIGHT_EXECUTABLE_PATH` at a Chromium binary. `SCREENS=1 npm run test:e2e -- zz-screens` captures screenshots of every major screen for visual review.

---

## Roadmap
- Optional cloud sync across devices
- Character card import (SillyTavern V2 JSON/PNG)
- Multiple alternate replies ("swipes") per turn
- A collapsible "what the narrator remembered" panel for each reply
- Optional light theme

## License
MIT. Fork it, ship it, mod it. Pull requests welcome.
