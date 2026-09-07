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

## 8. Questions I expect, with answers

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
