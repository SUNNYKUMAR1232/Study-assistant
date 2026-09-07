# Study Assistant

Paste any study material — lecture notes, a textbook passage, an article — and get back a deck of flashcards and a multiple-choice quiz you can actually work through.

---

## 1. What it solves and how it works

### The problem

Turning raw notes into something you can test yourself against is slow, boring work. Most people skip it and re-read the notes instead, which feels productive and isn't. Active recall works better, but only if the questions already exist.

This app makes them exist, in about five seconds, from whatever text you already have.

### What you get

- **Flashcards** — flip, shuffle, navigate with arrow keys.
- **A quiz** — four options per question, an explanation after every answer, and a **retest only the ones you missed** loop at the end.
- **A session sidebar** — every session you generate is saved automatically and listed on the left, so you can jump back to any of them. Identical input is served from cache instead of being billed again.
- **A live connection indicator** — a green dot in the header when the server can actually reach Groq, with the round-trip latency. It turns amber if the server has no API key and red if Groq is unreachable, so a misconfigured setup is visible immediately rather than after you've typed a paragraph and pressed generate.

### How it works

```
 Your text
     │
     ▼
 InputPanel ─────► useGeneration ─────► POST /api/generate
 (no fetch here)   (abort + stale         (server only —
                    guard + cache)         the API key lives here)
                                                │
                                                ▼
                                        generate.server.ts
                                                │
                                    Groq, forced to call the
                                    save_study_session tool
                                                │
                                                ▼
                                         normalize.ts
                                   (assume the model lied:
                                    repair, drop, or reject)
                                                │
                                                ▼
                                       Zod-validated session
                                                │
     ┌──────────────────────────────────────────┘
     ▼
 FlashcardDeck / QuizRunner  (pure props, zero network awareness)
```

**The model is asked for structured data through tool calling, not prose.** The Zod schema in `schema.ts` is converted to a JSON Schema and handed to Groq as a tool definition, and the model is *forced* to call it (`tool_choice`). The provider then constrains generation to that shape.

**And then we assume it failed anyway.** Forced tool calls still produce model-written text: truncated JSON, an answer given as `"B"` instead of `1`, a question with three options, duplicate ids. `normalize.ts` is the only module in the codebase that knows this, and it fixes what it can, drops what it can't, and reports what it did.

### Failure handling — the part worth reading

| What goes wrong | What the app does |
|---|---|
| Malformed / truncated JSON | Strips code fences, retries the widest brace-balanced slice, strips trailing commas |
| Wrong shape (`cards` not `flashcards`, `q`/`a` not `front`/`back`) | Accepts known aliases, then validates against Zod |
| Answer as `"B"`, `"2"`, or the option text | Resolved to a real index; unresolvable questions are dropped, not guessed |
| Some items broken, others fine | **Partial success.** Good items render; a yellow notice says exactly how many were skipped |
| Empty response | A real error with a retry button |
| Slow | 45s client timeout via `AbortController`; a Cancel button that actually aborts |
| Rate limited / upstream down / bad key | Mapped to a specific code and a message that says what to do |
| A stale response arrives after a newer one | **Discarded.** Every request claims a monotonic id; only the newest may write to state |
| A render bug we didn't anticipate | `app/error.tsx` boundary — a recovery button, never a blank page |
| Missing key, dead network, revoked key | Surfaced **before** you type, by the live indicator in the header |

**You don't have to take that table on faith.** In development, a **Chaos mode** dropdown appears under the form. Pick a failure — `malformed-json`, `wrong-shape`, `empty`, `partial`, `slow`, `rate-limit`, `upstream-error` — and the server injects it. The broken payloads run through the *real* normaliser, so what you see is genuine recovery behaviour, not a mocked screen. No chaos mode ever reaches Groq, so experimenting costs nothing, and the whole thing is disabled in production builds.

---

## 2. Architecture and folder structure

```
src/
  app/                              ← routing + transport only
    layout.tsx
    page.tsx                        ← renders the workspace; owns nothing
    error.tsx                       ← last-resort error boundary
    globals.css
    api/generate/route.ts           ← validates, delegates, maps errors to HTTP
    api/health/route.ts             ← connection status for the live indicator

  features/
    study-session/                  ← the one real feature domain
      api/
        schema.ts                   ← Zod. THE contract. Imported by both sides.
        prompt.ts                   ← system/user prompts + the tool definition
        normalize.ts                ← the only module that distrusts the model
        groqClient.server.ts        ← the only place the API key is read
        generate.server.ts          ← the Groq call
        health.server.ts            ← cached upstream reachability probe
        chaos.ts                    ← dev-only failure injection
      hooks/
        useGeneration.ts            ← fetch, abort, stale guard, cache, status
        useApiHealth.ts             ← polling connection status
        useComposerDraft.ts         ← the draft, so it survives navigation
        useFlashcards.ts            ← index, flip, shuffle
        useQuiz.ts                  ← answers, score, missed, retest
        useSessionLibrary.ts        ← auto-saved session history
      components/
        Workspace.tsx               ← wiring + the one bit of navigation state
        AppShell.tsx                ← sidebar rail / drawer layout
        Sidebar.tsx                 ← history list, New session, status
        ...                         ← the rest are presentational
      types.ts                      ← every type inferred from schema.ts

  shared/
    ui/                             ← Button, Card, ProgressBar, loading/empty/error
    lib/                            ← cn, fetchWithTimeout, hashText, storage

scripts/
  deploy.mjs                        ← one-command deploy: verify → build → ship → smoke-test
```

### Why this structure

**Feature-based, not type-based.** Grouping by `components/`, `hooks/`, `utils/` scatters one feature across three folders and hides its boundary. Grouping by feature means everything a study session needs sits in one directory, and the import graph shows you the seams.

**There is exactly one feature, and that's deliberate.** No empty `features/auth/` or `features/settings/` to look architectural — empty folders are cargo-culting, and they invite the obvious question. The boundary is real, not decorative: adding a second mode, say cloze deletion, would be `features/cloze` and would not touch this folder. That's the test a feature boundary has to pass.

**`schema.ts` is the single source of truth, and it is the strongest thing in the codebase.** One file defines what the model is asked to produce, what the server accepts, and what the UI can rely on:

- the route handler validates the request with it
- it becomes the JSON Schema in the tool definition sent to Groq
- `normalize.ts` validates the response against it
- `types.ts` infers every TypeScript type from it — nothing is hand-written twice
- the **client** re-validates the server's response with it, so a deployed version that drifts from the contract is treated as a failure rather than rendered blind

Change a field once and every layer either follows or fails to compile.

**Three layers, and they don't leak:**

| Layer | Files | Knows about |
|---|---|---|
| Transport | `route.ts`, `generate.server.ts` | HTTP and Groq. No prompt text in the route; no HTTP in the Groq module. |
| Contract | `schema.ts`, `normalize.ts` | The shape, and the fact that the model is unreliable. Nothing else knows. |
| Presentation | `hooks/`, `components/` | Interaction state and pixels. **No component calls `fetch`, ever.** |

The test that proves the separation: *could you swap Groq for a hardcoded fixture by changing one file?* Yes — `generate.server.ts`. That seam is also why `chaos.ts` was cheap to build.

### State management — and what I deliberately left out

`useState` for local interaction, `useReducer` for the one real state machine, props downward. **No React Query, no Zustand, no Context.** That is a decision, not an omission:

- **React Query** is built for caching, refetching, and invalidating server data keyed by URL. This app has one non-idempotent `POST` that must never be silently refetched. I'd be fighting the library, and its `AbortController` handling would bury the stale-response guard — which is the single most important behaviour here. Writing that guard by hand (`requestIdRef`) is the point, not a workaround.
- **Zustand** solves prop-drilling across distant trees. This tree is three levels deep with one data owner. Adding a store would be resume-driven, not problem-driven.
- **Context** would be preemptive. It goes in when prop-drilling actually starts to hurt.

The caching that this app genuinely needs is a `localStorage` entry keyed by a hash of the input — identical text is never re-billed, and reloading is instant. That's twenty lines, not a dependency.

### Performance — two things, both justified

Code-splitting a single-route app is theatre, so there are only two real optimisations:

1. **`next/dynamic` on `QuizRunner`.** Honest, because plenty of users will only ever use the flashcards. The quiz chunk isn't downloaded until the tab is opened.
2. **The `localStorage` cache**, above — it saves a network round trip and an API call, not a render.

There is no `memo`/`useMemo` unless it prevents a re-render I could name. Unjustified memoisation is noise.

### Accessibility and mobile

Built at 375px first and scaled up. Every interactive control is at least 44px tall; every text input uses a 16px font so iOS doesn't zoom on focus; pinch-zoom is never disabled. Full keyboard support (arrows navigate, Space flips, Ctrl/Cmd+Enter submits), `aria-live` on loading and results, and quiz correctness communicated by icon and screen-reader text as well as colour. Light and dark are switchable from the sidebar and remembered per browser, defaulting to your OS setting; the theme is applied by an inline script before first paint, so reloading never flashes the wrong one. Colour is reserved for meaning — green for a correct answer, red for wrong, amber for a partial result — which is why the primary button is neutral rather than branded.

---

## 3. Setup

### Requirements

- **Node.js 18.18 or newer** (Node 20+ recommended)
- **npm** (or pnpm/yarn)
- **A Groq API key** — free at [console.groq.com/keys](https://console.groq.com/keys)

### Instructions

**1. Install dependencies**

```bash
npm install
```

**2. Add your API key**

```bash
cp .env.example .env.local
```

Then open `.env.local` and set:

```
GROQ_API_KEY=gsk_your_actual_key_here
```

> The key is read **only** in `generate.server.ts`, which runs on the server. It is never sent to the browser, never inlined into the bundle, and there is no `NEXT_PUBLIC_` variable anywhere in this project. `.env.local` is gitignored.

**3. Run it**

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Click **Use sample text** if you want something to paste.

**4. Try breaking it**

With the dev server running, use the **Chaos mode** dropdown under the form to force each failure mode and watch the UI recover.

### Other commands

```bash
npm run build      # production build
npm run start      # serve the production build
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
```

### Deploying

One command, to Vercel:

```bash
npm run deploy
```

It runs in a deliberate order — **everything that can fail locally fails before anything is pushed anywhere**:

1. Checks Node version, installed dependencies, and that `GROQ_API_KEY` is set (it prints the length and last four characters, never the key).
2. Typechecks and runs a full production build. A broken build never reaches a URL.
3. Asks you to confirm, naming what it is about to upload.
4. Syncs `GROQ_API_KEY` and `GROQ_MODEL` to Vercel as **server-side** environment variables, passed over stdin rather than as command-line arguments so they never land in your shell history. Existing values are replaced, so rotating a key is just a re-deploy.
5. Deploys, then **smoke-tests the live `/api/health` endpoint** and reports the real Groq latency. A deploy that returns a URL but cannot reach Groq exits non-zero rather than claiming success.

Variants:

```bash
npm run deploy:check     # every local check, nothing remote — safe to run anytime
npm run deploy:preview   # preview deploy instead of production
node scripts/deploy.mjs --yes            # non-interactive, for CI
node scripts/deploy.mjs --skip-checks    # skip typecheck/build
```

The script calls `tsc` and `next` by their resolved paths rather than through `npm run`, so it also works on machines where the npm shim itself is broken.

> **First run:** the Vercel CLI will ask you to log in and link the project. That's a one-off; afterwards `npm run deploy` is genuinely one command.

### Optional configuration

| Variable | Default | Purpose |
|---|---|---|
| `GROQ_API_KEY` | — | **Required.** Your Groq key. |
| `GROQ_MODEL` | `openai/gpt-oss-120b` | Swap the model without touching code. |

> **If the indicator is green but generating returns "Groq could not complete the request":** your key's model catalog probably doesn't include the configured model. The health probe only proves the key and network work, not that a *specific* model is available. Check `https://api.groq.com/openai/v1/models` with your key and set `GROQ_MODEL` to one you actually have. The server log prints the exact upstream error.

---

## 4. AI usage note

**In the product.** The only model call is a single Groq chat completion in `generate.server.ts`, using `openai/gpt-oss-120b` with forced tool calling. The prompt instructs the model to use *only* facts present in the pasted material and to return fewer items rather than pad. There is no streaming, no second call, and no agentic loop — one request, one structured result.

**In building it.** I used Claude (via Claude Code) as a pair-programming assistant: scaffolding, drafting the Tailwind class strings, and pushing back on my own architecture choices. Everything it produced I read, edited, and can defend line by line — the normalisation strategy, the stale-response guard, and the decision to skip React Query are mine, and `ARCHITECTURE.md` records the reasoning for each. Where I disagreed with a suggestion (adding React Query, inventing extra feature folders), I didn't take it.

---

## 5. Known limitations

- **No streaming.** The result appears all at once after ~3–6 seconds. Streaming a *validated* structured payload means parsing partial JSON and re-validating on every chunk; I'd rather ship a correct blocking version than a flickering half-validated one. It's the first thing I'd add next.
- **No refinement loop.** You can't say "make question 3 harder" — you regenerate. A follow-up edit path would need the session sent back as context and a diff-shaped tool.
- **One block type.** Flashcards and quiz only, not the stretch goal of arbitrary AI-chosen blocks (charts, checklists). The contract is a discriminated union away from supporting it, but every new block type needs its own renderer and its own normaliser branch.
- **Cache is never invalidated.** Identical input always returns the cached session; there's no "regenerate anyway" unless you hit Retry after an error. Saved sessions cap at 20 and are per-browser — no account, no sync.
- **Input is capped at 12,000 characters** and truncation is the user's job. No PDF or file upload.
- **English-centric prompt.** Other languages work but quality is untested.
- **The connection indicator proves reachability, not capability.** It probes `models.list()`, which is free and consumes no token quota, so it confirms the key is valid and the network is open — but it cannot tell you that the *configured model* is available to your account, or that you have quota left. Those still surface as an error on generate. Probing with a real completion would be more honest and would cost tokens on every poll; I took the cheap check and documented the gap.
- **No automated tests.** `normalize.ts` is the obvious first target — it's pure, and every branch corresponds to a real failure I've seen. Chaos mode covers the paths manually for now.
- **The model can still be wrong.** Distractors are occasionally ambiguous and explanations occasionally restate the question. The app validates *shape*, not *truth*, which is why the footer says so.

---

## 6. Time spent

**~8 hours**, roughly:

| Time | Work |
|---|---|
| 0:30 | Scaffold, folder structure, shared UI primitives |
| 0:30 | Zod schema and inferred types — contract before anything else |
| 1:30 | Route handler, Groq tool calling, normalisation and salvage |
| 1:15 | `useGeneration` — reducer, abort, stale guard, cache |
| 1:15 | Input panel and flashcard deck |
| 1:15 | Quiz runner, results, retest-missed loop |
| 0:45 | Loading/empty/error states, mobile at 375px, chaos mode |
| 1:00 | README, architecture notes, commit history |

The largest single block went to failure handling, which felt like the right allocation given what the brief said carries the signal.

---

## Thanks

Thanks for reading this far, and thanks for an assignment that asked about failure handling instead of another CRUD list — it's a much better question, and it made for a genuinely interesting build.

Happy to walk through any decision here, especially the ones I argued myself out of.
