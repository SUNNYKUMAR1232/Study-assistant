# Architecture & Decisions — interview prep

Private notes. Every choice in this codebase, why it was made, what I rejected, and the answer I'd give if pushed. Read the **"If they ask"** lines out loud once before the call.

---

## 0. The thirty-second summary

> Study Assistant turns pasted notes into flashcards and a quiz. One Groq call, forced through a tool definition generated from a Zod schema, then normalised on the assumption the model lied. The Zod schema is the single source of truth — it validates the request, becomes the tool's JSON Schema, validates the response on the server, validates it *again* on the client, and every TypeScript type is inferred from it. The React side is three layers: hooks own state, components own pixels, and no component calls `fetch`.

If you say nothing else, say that.

---

## 1. Why tool calling instead of asking for JSON

**What I did.** `zodToJsonSchema(StudySessionSchema)` produces the `parameters` of a `save_study_session` tool. The model is given that tool and `tool_choice` forces it to call it.

**Why.** Three separate reasons:

1. **The provider constrains generation.** Groq applies the JSON Schema during decoding, so the common failures — prose wrapped around the JSON, a code fence, a missing closing brace — largely stop happening at the source rather than being cleaned up after.
2. **No duplicated shape.** JSON mode would mean pasting an example structure into the prompt, which immediately drifts from the Zod schema. Deriving the tool schema means one definition.
3. **It's the honest version of "structured output."** The SDK isn't doing anything magic — see §2.

**If they ask "what is the SDK actually doing for you?"**
> Not much, and that's deliberate. `groq-sdk` is an HTTP client — it serialises the request, retries once on a connection error, and surfaces a typed `APIError`. The structured-output guarantee comes from the *provider* constraining decoding against the JSON Schema I sent, not from the SDK. The SDK doesn't validate the response against the schema either. That's why `normalize.ts` exists: `tool_calls[0].function.arguments` is still a **string of model-generated text** that I have to parse and validate myself. If I'd used a library that hid that step, I wouldn't know where my failure surface was.

**Trade-off I accepted.** Tool calling is slightly slower than plain JSON mode and not every provider supports forcing a specific tool. Mitigated: if `tool_calls` is missing, the code falls back to `message.content` and runs it through the same normaliser.

---

## 2. `normalize.ts` — the file I'd want them to open

**The premise.** Structured output reduces failures; it doesn't eliminate them. I've seen all of these from real calls:

| Failure | Handling |
|---|---|
| Truncated JSON (hit `max_tokens`) | Fence-strip → widest brace-balanced slice → trailing-comma strip |
| `answerIndex: "B"` | Letter → index |
| `answerIndex: 4` with 4 options | 1-based off-by-one, corrected |
| `answerIndex` as the option *text* | Matched against the options array |
| `cards`/`q`/`a` instead of `flashcards`/`front`/`back` | Known aliases accepted |
| 3 options, or two identical options | Question **dropped** — it's unrenderable and can't be repaired honestly |
| Duplicate ids | Rewritten — they break React keys *and* quiz scoring, since answers are keyed by id |
| Everything broken | `{ ok: false, reason }` → real error state |

**The design rule, and the line I'd lead with:**
> It's forgiving in exactly one direction. It will repair or drop an *individual item*, but it will never invent study content the model didn't produce, and it will never hand the UI a value the schema rejects. A user studying from fabricated flashcards is worse than a user seeing "3 cards were skipped."

**Partial success is a first-class state, not a failure.** 6 good cards out of 8 renders 6 cards plus a yellow notice naming what was dropped. Most implementations throw the whole payload away on the first Zod error; that's the difference between per-item and per-payload validation, and it's the single most useful thing in the file.

**If they ask "why is this the only place that knows the model is unreliable?"**
> Because if that knowledge leaks upward, every component starts defensively checking whether `options` has four entries. One module owns the distrust, everything above it gets a `StudySession` it can render without thinking. That's also what makes chaos mode cheap — I feed broken text into the real normaliser and the whole app reacts genuinely.

---

## 3. The stale-response guard — the highest-signal thing here

**The bug it prevents.** User submits text A (slow). Edits, submits text B (fast). B renders. A arrives 4 seconds later and overwrites it. The user is now studying the wrong material, with no error and nothing on screen indicating anything went wrong. It's silent and it's a data-correctness bug, not a UI bug.

**The fix**, in `useGeneration.ts`:

```ts
const requestId = ++requestIdRef.current;
const isCurrent = () => requestId === requestIdRef.current;
// ...after every await:
if (!isCurrent()) return;   // a newer request has since started
```

**Why a ref and not state.** A ref is synchronous and doesn't trigger a render. State would be one render behind, so two submissions in the same tick could both believe they're current. The check also has to happen *after every await*, not just once — `await fetch` and `await response.json()` are two separate suspension points where a newer request can start.

**Why both an id and an AbortController.** They solve different halves:
- **`AbortController`** stops the work — cancels the in-flight request, frees the connection, and stops the server generating. Also fires on unmount.
- **The request id** stops the *write*. Aborting is asynchronous and racy; a response can already be resolving when `abort()` lands. The id makes discarding it deterministic.

Using only one leaves a hole. This is the answer I'd most want to be asked for.

**Subtlety worth mentioning unprompted:** in the `catch`, an abort *we* caused isn't shown as an error — the user cancelled, that's not a failure. But a *timeout* aborts a different internal controller inside `fetchWithTimeout`, so it still surfaces as a real, retryable error. Two aborts, two meanings.

---

## 4. Why no React Query / Zustand / Context

**The framing I'd use:** deliberately declining a popular library, with a reason, is a stronger answer than adopting it reflexively.

**React Query.** Built for caching, refetching, and invalidating *server data keyed by a URL*. This app has one non-idempotent `POST` that must never be silently refetched — background refetch on window focus would re-bill the user for the same generation. I'd be disabling most of the library's behaviour to use it. And critically: its `AbortController` handling would bury the stale-response guard, which is the most important behaviour in the app. Writing it by hand is the point.
> If this grew to *fetch* saved sessions from a server, list them, and invalidate on save — that's genuinely its problem, and I'd add it.

**Zustand.** Solves prop-drilling across distant subtrees. This tree is three levels deep with a single data owner. Adding a store would be resume-driven development.
> The defensible use would be persisted saved sessions if they became genuinely global and cross-cutting. Today they're one hook, consumed in one place.

**Context.** Preemptive. It goes in when prop-drilling actually hurts, not before.

**What I used instead:** `useReducer` for the one real state machine, `useState` for local interaction, props downward.

**If they ask "why `useReducer` for generation but `useState` elsewhere?"**
> Because generation has genuinely interdependent fields — `status`, `data`, `meta`, `error`, `fromCache`. Setting them with five `useState` calls means five chances to leave them inconsistent, like `status: "error"` with stale `data` still present. A reducer makes each transition one atomic, testable, named function. Card-flipped is a single boolean with no invariants; a reducer there would be ceremony.

---

## 5. Layering, and the test that proves it

| Layer | Files | Knows |
|---|---|---|
| Transport | `route.ts`, `generate.server.ts` | HTTP / Groq |
| Contract | `schema.ts`, `normalize.ts` | The shape; that the model lies |
| Presentation | `hooks/`, `components/` | Interaction state; pixels |

**The falsifiable test:** *could I swap Groq for a hardcoded fixture by changing one file?* Yes — `generate.server.ts`. Nothing above it names a provider. That seam is why `chaos.ts` took fifteen minutes.

**The absolute rule:** no component calls `fetch`. Components take props and emit callbacks. `page.tsx` owns layout and wiring and no state of its own.

**Why the route handler has no prompt text in it.** A route handler is transport: parse, validate, delegate, map errors to status codes. Prompts are domain logic. If they lived in the route, I couldn't reuse generation from a server action or a background job without dragging HTTP along.

---

## 6. Validating the server's own response on the client

Unusual enough that it's worth raising myself.

```ts
const parsed = GenerateResponseSchema.safeParse(json);
```

**Why.** The client and server ship independently — a cached bundle can outlive a deployed API change. Without this, a contract drift renders as `undefined.map is not a function` in a component. With it, it's a clean error state and a retry button. Same schema, so it costs one import.

**The counter-argument** (have it ready): it's redundant when both sides deploy atomically, and it parses the payload twice. I think ~1ms is a fair price for making an entire class of crash impossible, and it's the only thing standing between a stale bundle and a white screen.

---

## 7. Chaos mode

**What.** A dev-only dropdown; sends an `x-chaos-mode` header; the route injects a specific failure.

**Why it isn't a mock.** The broken payloads are fed through the **real** `normalizeStudySession`. `partial` contains a genuinely empty card, a duplicate id, a letter answer, and a 2-option question — and the UI's response is real recovery, not a canned screen.

**Why it exists at all.**
> Every project claims to handle model failure. Almost none can demonstrate it on demand, because you can't make a model misbehave on cue. This makes the claim falsifiable in one click — and it's how I actually developed the normaliser.

**Security:** `resolveChaosMode` returns `null` immediately when `NODE_ENV === "production"`. It cannot be triggered by a caller in a deployed build. **I verified this against a real production build** — sending `x-chaos-mode: rate-limit` to `next start` is ignored and produces a genuine generation. Worth stating before they ask.

**A bug I found auditing this, worth telling as a story.** `slow` originally slept 60s and then returned `null`, letting the request *fall through to the real Groq call*. Two things were wrong: the sleep ignored `request.signal`, so the handler kept running for the full minute after the client had disconnected; and picking "slow" in a dev dropdown could spend real API quota. It only appeared harmless because the client aborts at 45s, which happened to abort the provider call too — a `curl` with no timeout would have been billed. Now the sleep is abort-aware and `chaosResponse` always returns a response, so **no chaos mode can ever reach the provider**. The lesson: a fault injector that can fall through to the real dependency is not an injector, it's a delay.

---

## 7b. The live connection indicator

**What.** A green dot in the header with round-trip latency, backed by `GET /api/health`. Amber when the server has no key, red when Groq is unreachable, grey when *the browser* is offline.

**Why it's worth having.** Before it, a missing or revoked key surfaced only after the user pasted a paragraph and pressed generate — the failure appeared to be about their input when it was about my configuration. Moving that signal to page load turns a confusing failure into an obvious one.

**The design decisions I'd defend:**

1. **Probe `models.list()`, not a chat completion.** It's a metadata call, so it proves the key is valid *and* the network path is open, while consuming **zero token quota**. A completion-based probe would be more truthful but would bill the user on every poll. I took the cheap check and wrote the gap into the README's limitations — it can't prove the configured *model* is available. That gap is real and I hit it in testing.
2. **Cached server-side for 60s.** Clients poll on a shorter cycle, so N browser tabs collapse into at most one upstream probe per minute. `?force=1` bypasses it for the manual re-check button.
3. **The route always returns HTTP 200**, with the state in the body. A 502 here would be indistinguishable from the app server itself being down — which is the one thing this endpoint exists to tell apart.
4. **"Offline" is a separate client state.** `navigator.onLine` is checked before fetching, and I listen for `online`/`offline`. Reporting "server unreachable" when the user's wifi dropped sends them debugging the wrong machine.
5. **Event-driven, not aggressive polling.** 45s interval, plus a re-check on window `focus` and on regaining network — those are the moments the answer actually changes. Polling every 5s would be load without information.
6. **Same stale-guard as `useGeneration`.** Polls overlap; a slow probe must not overwrite a newer fast one. Same `requestIdRef` discipline, for the same reason (§3).

**If they ask "isn't a health check overkill for a take-home?"**
> It's twenty lines of server code and it converts my single worst first-run experience — silent misconfiguration — into a visible one. It also gave me a free place to put latency, which is the number I'd want in production anyway.

---

## 8. API key handling

Read from `process.env.GROQ_API_KEY` in `generate.server.ts` only. That module imports `server-only`, so importing it from a client component is a **build error**, not a runtime leak. No `NEXT_PUBLIC_` variable exists in the project. `.env.local` is gitignored.

**If they ask what else you'd add before production:** rate limiting per IP on the route (the obvious hole — right now anyone can drain the key), a request size cap at the edge, and a spend alert on the Groq account.

---

## 8b. The deploy script

`npm run deploy` → `scripts/deploy.mjs`. Worth a minute if they ask about shipping.

**The ordering principle:** every check that can fail locally runs *before* anything is pushed to a third party. Prereqs → typecheck → build → confirm → upload secrets → deploy → smoke-test. A broken build never reaches a real URL, and I never upload a key for a deploy that was going to fail anyway.

**Details I'd point at:**

- **Secrets go over stdin, not argv.** `vercel env add` reads the value from the child process's stdin. Passing it as an argument would put the key in the shell history and in the process table.
- **The key is never printed** — only its length and last four characters, which is enough to confirm *which* key without leaking it.
- **`env rm` before `env add`.** Vercel rejects a duplicate, so rotating a key would otherwise fail on the second deploy. Removing first makes the operation idempotent; a missing variable makes the `rm` a harmless no-op.
- **It smoke-tests the deployment.** It hits the live `/api/health` and exits non-zero if the deployed server can't reach Groq. A URL coming back is not the same as the thing working — this is the same instinct as the health indicator itself (§7b).
- **`--dry-run`** runs every local check and touches nothing remote, so the script is safe to run at any time.
- **`shell: true` is opt-in, per command.** A shell doesn't escape arguments, so a project path containing a space — like `D:\Project\Study assistant` — gets split in two. Node binaries are spawned directly; only `npx` (a `.cmd` shim on Windows) gets a shell. **I hit this bug in testing**, which is the honest reason I know about it.
- **Local tools are invoked by resolved path**, not via `npm run`, so the script survives a broken npm shim.

**If they ask "why not just `git push` and let Vercel's GitHub integration build it?"**
> For a team, that's the right answer — CI should own deploys. This is a single-developer take-home with no CI, and I wanted the failure modes visible in one place: the local build, the secret sync, and a real post-deploy health assertion. The script is also self-documenting for whoever runs it next.

---

## 8c. The two-screen shell

**What.** A ChatGPT-shaped layout: a session history rail on the left, the composer or the session in the main pane. Below `lg` the rail becomes an off-canvas drawer.

**Why two screens instead of one scrolling page.** Results used to stack under the form. On a 375px phone that put the thing the user just asked for below the fold, so a successful generation looked like nothing had happened. Submitting now navigates to the session screen immediately, which means the loading state appears where the result will be.

**Decisions worth defending:**

1. **Sessions save themselves.** A history list the user has to remember to populate stays empty. Every successful generation is persisted and the user curates by deleting. `record()` de-duplicates by content fingerprint, so re-opening a stored session does not clone it.
2. **The sidebar is mounted once and repositioned with CSS** (`fixed` → `lg:static`). I first rendered it twice — a desktop copy and a drawer copy — and **testing caught it**: the history list showed four entries for two sessions, and, worse, two `useApiHealth` hooks were running two polling loops and doubling the health requests. Duplicating a subtree duplicates its effects.
3. **The breakpoint is tracked in JS as well as CSS** (`matchMedia`). Modal semantics — `role="dialog"`, `aria-modal`, focus capture, scroll lock, Escape — belong to the drawer, not to the desktop rail. CSS alone cannot express that, and a rail permanently announcing itself as a modal dialog is worse than no dialog at all.
4. **Back preserves the draft; New session clears it.** Two different intentions deserve two different controls. Making that work meant lifting the draft out of `InputPanel` into `useComposerDraft` — component-local state dies on unmount, which would turn "back" into "discard".
5. **The metadata row is gone.** Model name, latency and cache-source were developer-facing detail sitting in the user's way. The same information still reaches me through the connection indicator and the server log.
6. **The quiz scores out of 100**, so a 5-question quiz and a 15-question one are directly comparable; the raw `3 of 5 correct` sits underneath.

**If they ask "why not real routes per session?"**
> Sessions live in `localStorage`, so a `/session/[id]` route would render a shell on the server and fill it in on the client anyway — the URL would look meaningful without being shareable. One route with a screen state is the honest version. If sessions moved server-side, routes would be the right call, and that's the point at which React Query would earn its place too (§4).

---

## 9. Mobile & accessibility specifics

- Designed at 375px first; the layout is a single column that gains breathing room, not a desktop layout squeezed down.
- **44px minimum touch target** on every control (`min-h-11`).
- **16px font on every input** — iOS Safari zooms the viewport when a focused input is under 16px, which is jarring and hard to undo. There's a `@supports` backstop in `globals.css`.
- `maximumScale: 5` — pinch-zoom is never disabled. Some people need it.
- `min-h-dvh`, not `min-h-screen`: `vh` is wrong on mobile browsers with a retracting URL bar.
- Keyboard: arrows navigate, Space flips, Ctrl/Cmd+Enter submits. The global handler bails when focus is in an input, so it never hijacks typing.
- `aria-live` on loading and answer feedback; `aria-busy` on loading buttons.
- **Quiz correctness is never colour-only** — there's an icon and screen-reader-only text too. Red/green is the exact pair colourblind users can't distinguish.
- Dark mode is driven by `data-theme` on `<html>`, set by a tiny inline script in the document `<head>` **before first paint**. Doing it in React would render the default theme and repaint — the flash of wrong theme. The preference has three states, not two: `system` is a real choice that keeps following the OS, and light/dark pin it. The toggle flips what is *on screen*, not what the OS wants.
- The toggle icon is withheld until after mount. The server cannot know a `localStorage` preference, so rendering an icon during SSR would guess wrong half the time and visibly swap on hydration; the button holds its footprint meanwhile so nothing shifts.
- `prefers-reduced-motion` kills the card-flip animation.

---

## 9b. Colour

**The rule: colour carries meaning, never decoration.** Emerald means a correct answer, rose a wrong one, amber a partially damaged result. Nothing else on the screen is allowed to be colourful, so those three always read as signal.

That is why the **primary button is neutral** — near-black on light, near-white on dark. An indigo button competes with the quiz feedback for attention and spends a hue on "this is a button". Neutral also beats any accent on contrast, so the main action stays the loudest thing on screen without borrowing a semantic colour.

**What I removed and why.** Indigo was originally doing six jobs: primary button, progress fill, focus rings, active tab, sidebar selection, and the flashcard answer face. An accent that appears everywhere stops being an accent. Now the flashcard back is distinguished by its label and a step in surface weight rather than a tint, the progress bar and quiz hovers are neutral, and **indigo survives only on focus rings and one text link** — roughly the 10% accent budget the 60/30/10 guide suggests.

**Constraint worth naming:** in this app the accent *cannot* be green, red, or amber without making quiz feedback ambiguous. That eliminates most of the palette, which is part of why neutral-primary was the right answer rather than just a fashionable one.

**Accessibility:** emerald/rose is exactly the pair red-green colourblind users cannot separate. Correctness is therefore also carried by a ✓/✕ icon and screen-reader-only text, so the palette is never load-bearing.

---

## 9c. The glass shell

The sidebar and mobile top bar are frosted — translucent with `backdrop-blur` — over a soft gradient. **Content surfaces stay solid.**

**Why only the shell.** Glass costs contrast. Body text, and especially the emerald/rose answer states, must not sit on a blurred, semi-transparent background — that is exactly the readability those colours are carrying. Chrome (navigation, status) can afford it because it holds short labels; content cannot. So the effect is bounded to surfaces where it is free.

**The gradient exists to serve the blur.** `backdrop-filter` over a flat fill produces nothing visible. The app root carries a subtle gradient so the frosted panels have something worth blurring.

**A bug I shipped into my own review and caught in the browser.** I first put the frosted surface on the *sidebar's content* rather than on the `<aside>` that wraps it. The drawer's own header row is a sibling of that content, so it stayed fully transparent and the page title behind it bled through — the two headings rendered on top of each other. Moving the surface up to the `<aside>` fixed it and is the better structure anyway: **the shell owns the panel's chrome, the sidebar owns its content.**

**Opacity is breakpoint-dependent**, which is the non-obvious part. As a drawer it covers arbitrary page content, so it sits at 95% — blur alone does not stop high-contrast text reading through. From `lg` it only ever covers the background gradient, where 70% is safe and actually reads as glass. Same component, different risk.

---

## 10. Performance — including what I refused to do

**Did:**
1. `next/dynamic` on `QuizRunner` — plenty of users only use flashcards, so the quiz chunk isn't downloaded until the tab opens. Real, and honestly justifiable.
2. `localStorage` cache keyed by a hash of `text + counts + difficulty` — saves a network round trip *and* an API call.

**Refused:**
- Code-splitting anything else. One route, small bundle — `next/dynamic` on a flashcard would be theatre.
- `memo` / `useMemo` / `useCallback` I can't justify. The `useMemo`s that exist wrap array work over the full deck; the ones I didn't add would wrap string concatenation.

**If they ask "why is `useCallback` on every hook return, then?"**
> Because those functions go into `useEffect` dependency arrays in the components — the keyboard handler in `FlashcardDeck` re-binds a window listener on every change. There it's correctness, not premature optimisation. That's the distinction: I can name the re-render.

---

## 11. Questions I expect, with answers

**"Walk me through what happens when the model returns garbage."**
> Depends which garbage. Truncated JSON: the extractor tries fence-stripping, then the widest brace-balanced slice, then trailing-comma repair; if all fail it's an `unparseable` error with a retry. Wrong-but-parseable shape: each item goes through Zod individually — the good ones render, the bad ones are dropped, and a notice names the count. Nothing renders that hasn't passed the schema.

**"How do you know it works?"**
> Chaos mode — I can trigger each failure in one click. That's also how I developed the normaliser. `normalize.ts` is pure and is the obvious first unit-test target; no automated tests yet, and I'd list that as the top gap.

**"Why Next.js for what could be a Vite SPA?"**
> The brief says don't ship the key in the browser, so I need a backend. Next gives me a route handler in the same repo with the same TypeScript config, so `schema.ts` is genuinely shared between client and server via one import rather than a copied type. With Vite I'd run a separate Express server and either duplicate the contract or add a shared package. For one endpoint, that's the wrong trade.

**"Why TypeScript when it isn't graded?"**
> Because the whole design is a shared contract, and TS is what makes the contract enforced rather than aspirational. `z.infer` means a schema change breaks compilation everywhere it matters. Without it, `schema.ts` would only be a runtime check.

**"What would you do with another day?"**
> Streaming, and unit tests on the normaliser. Streaming is the interesting one — you can't naively stream a *validated* payload, so I'd stream at the item level: emit each flashcard as it completes, validate it individually, append it to the deck. That composes with per-item validation I already have. Then rate limiting before it went anywhere real.

**"What's the weakest part?"**
> No tests. Chaos mode is a good manual harness but it's not CI. Second: the cache never invalidates, so identical input can't be regenerated without going through the error path — I'd add an explicit "regenerate" button.

**"Anything you'd do differently?"**
> I'd write `normalize.ts` before the route handler rather than alongside it. I discovered two coercions (letter answers, 1-based indices) only after wiring the UI, and each meant a small refactor. The contract-first instinct was right; I just didn't push it far enough.

---

## 12. One-liners to have ready

- **Structured output:** "The provider constrains decoding; the SDK just does HTTP. Validation is still mine."
- **Stale responses:** "AbortController stops the work, the request id stops the write. You need both."
- **Partial results:** "Per-item validation, not per-payload. Six good cards beat one error screen."
- **No React Query:** "One non-idempotent POST. I'd be disabling most of the library to use it."
- **The schema:** "One file is the prompt's tool schema, the server's validator, the client's validator, and every type."
- **Chaos mode:** "Everyone claims they handle model failure. This makes the claim falsifiable in one click."
