# Manual test plan

There are no automated tests yet — this is the checklist that stands in for them, and it is honest about that. Every case below has been run against a production build; the notes record what actually happened, not what was intended.

**Setup**

```bash
npm install
cp .env.example .env.local      # add your GROQ_API_KEY
npm run dev
```

Open http://localhost:3000. Demo inputs are in [`demo/`](demo/).

> **Chaos mode** appears under the form in development only. Most cases below use it, so they cost no API quota.

---

## 1. Happy path

| # | Step | Expected |
|---|---|---|
| 1.1 | Click **Use sample text**, then **Generate study session** | Screen switches to the session view immediately, showing a skeleton |
| 1.2 | Wait | Title, summary, `Flashcards (n)` / `Quiz (n)` tabs appear in ~3–6s |
| 1.3 | Check the sidebar | The session was saved to **History** automatically, and is highlighted as active |
| 1.4 | Generate the *same* text again | Returns instantly, no network request — served from the localStorage cache |

## 2. Flashcards

| # | Step | Expected |
|---|---|---|
| 2.1 | Click the card, or press <kbd>Space</kbd> | Card flips; label changes QUESTION → ANSWER |
| 2.2 | Press <kbd>←</kbd> / <kbd>→</kbd> | Moves between cards; each new card starts unflipped |
| 2.3 | Navigate past the last card | Wraps to the first |
| 2.4 | Click **Shuffle** | Order changes, position resets to card 1, button shows as pressed |
| 2.5 | Type in the composer, then press arrow keys | Keyboard shortcuts do **not** hijack typing |

## 3. Quiz

| # | Step | Expected |
|---|---|---|
| 3.1 | Open the **Quiz** tab | Loads on demand (separate JS chunk), brief skeleton |
| 3.2 | Choose an answer | Correct option turns green with ✓, a wrong choice turns red with ✕; explanation appears |
| 3.3 | Try to change your answer | Locked — the first answer is final |
| 3.4 | Finish the quiz | Score shown **out of 100**, with `n of m correct` beneath |
| 3.5 | Click **Retest n missed** | Only the missed questions are asked again |
| 3.6 | Score 100% | No retest button offered |
| 3.7 | Switch to Flashcards and back | Quiz answers and position are preserved |

## 4. Failure handling — the important section

Set **Chaos mode**, then generate. No API quota is used: chaos never reaches Groq.

| # | Mode | Expected | Verified |
|---|---|---|---|
| 4.1 | `malformed-json` | Error card: "The model did not return a JSON object" + **Try again** | ✅ 422 |
| 4.2 | `wrong-shape` | Error: "no usable flashcards or questions" | ✅ 422 |
| 4.3 | `empty` | Error + retry | ✅ 422 |
| 4.4 | `partial` | **Renders 2 cards + 1 question** plus an amber notice naming what was skipped | ✅ 200 |
| 4.5 | `rate-limit` | "Groq is rate limiting us. Try again shortly." | ✅ 429 |
| 4.6 | `upstream-error` | "Groq could not complete the request." | ✅ 502 |
| 4.7 | `slow` → wait 45s | Times out client-side: "That took too long…" + retry | ✅ |
| 4.8 | `slow` → **Back to editor** → **Cancel** | Request aborts; **no error is shown** (you cancelled, that is not a failure) | ✅ |
| 4.9 | Any error state | **Back to editor** is still available — you are never stranded | ✅ |

**4.10 — Stale response guard (highest-signal case).**
Set `slow`, generate. Immediately go back, set `partial`, generate again.
*Expected:* the second result renders, and the first **never** overwrites it, and no error appears when it is discarded.
*Verified:* ✅ — `bWon: true`, `noErrorFromA: true`.

**4.11 — Offline.** Kill your network, then generate.
*Expected:* connection pill goes grey ("You are offline"); the request fails with a retryable error rather than a crash.

## 5. Session history

| # | Step | Expected |
|---|---|---|
| 5.1 | Generate two different sessions | Both listed, newest first, with card/question counts and relative time |
| 5.2 | Click an older session | It opens; that row becomes the highlighted one |
| 5.3 | Re-open a stored session | It is **not** duplicated in the list |
| 5.4 | Delete the session you are viewing | Returns you to the composer |
| 5.5 | Delete a session you are *not* viewing | Current view is untouched |
| 5.6 | Reload the page | History survives (localStorage) |

## 6. Navigation

| # | Step | Expected |
|---|---|---|
| 6.1 | Type text, generate, click **Back to editor** | **Your text and settings are still there** — back is not discard |
| 6.2 | Click **New session** in the sidebar | Composer is cleared, no session is active, history is kept |
| 6.3 | Press <kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>Enter</kbd> in the textarea | Submits |

## 7. Input validation

| # | Step | Expected |
|---|---|---|
| 7.1 | Paste `demo/05-too-short.txt` (13 chars) | "27 more characters needed"; submit disabled; **no request sent** |
| 7.2 | Paste past 12,000 characters | Counter turns red, submit disabled |
| 7.3 | Set flashcards to 999 | Clamped to 20 |
| 7.4 | Set questions to 0 | Clamped to 3 |

## 8. Connection indicator

| # | Step | Expected |
|---|---|---|
| 8.1 | Normal start | Green dot, "API connected", round-trip latency in ms |
| 8.2 | Blank `GROQ_API_KEY` in `.env.local`, restart | Amber "No API key" + how to fix |
| 8.3 | Click the pill | Re-checks immediately (bypasses the 60s server cache) |
| 8.4 | Go offline | Grey "You are offline" — *not* "server unreachable" |

> **Known gap:** green proves the key and network work. It does **not** prove your configured model is available — that still surfaces as an error on generate. See the README's limitations.

## 9. Theme

| # | Step | Expected |
|---|---|---|
| 9.1 | Click the sun/moon in the sidebar footer | Theme flips immediately |
| 9.2 | Reload | Choice persists with **no flash of the wrong theme** |
| 9.3 | Clear `localStorage`, change your OS theme | App follows the OS until you pick explicitly |
| 9.4 | Pick light, then set OS to dark | Your explicit choice wins |

## 10. Mobile — test at 375px

| # | Step | Expected |
|---|---|---|
| 10.1 | Load at 375px | Single column; top bar with hamburger; no horizontal scrolling anywhere |
| 10.2 | Tap the hamburger | Drawer slides in over a scrim |
| 10.3 | Press <kbd>Esc</kbd> | Drawer closes, background scroll unlocks, focus returns to the hamburger |
| 10.4 | Tap the scrim | Closes |
| 10.5 | Open a session from the drawer | Drawer closes and the session opens |
| 10.6 | Focus any input | iOS must **not** zoom (all controls use 16px text) |
| 10.7 | Check every button | At least 44px tall |
| 10.8 | Resize from mobile to desktop with the drawer open | Becomes the static rail, not a stuck overlay |

## 11. Accessibility

| # | Step | Expected |
|---|---|---|
| 11.1 | <kbd>Tab</kbd> through the app | Visible focus ring on every control |
| 11.2 | Answer a quiz question with a screen reader | Correctness is announced in text, not colour alone (✓/✕ plus sr-only text) |
| 11.3 | Enable OS reduced-motion | Card flip and spinners stop animating |
| 11.4 | Zoom to 200% | Layout still usable; pinch-zoom is never blocked |

## 12. Security / production

| # | Step | Expected |
|---|---|---|
| 12.1 | Open DevTools → Network on any generate | The API key appears **nowhere** in the request |
| 12.2 | Search the built JS for your key | No match — it is read only on the server |
| 12.3 | `npm run build && npm start` | **Chaos mode controls are absent** |
| 12.4 | Send `x-chaos-mode: rate-limit` to the production build | Header ignored; a real generation runs | ✅ verified |

---

## Known gaps in this plan

- **It is manual.** `normalize.ts` is pure and is the obvious first unit-test target; every branch in it corresponds to a real failure mode. Chaos mode covers those paths by hand today.
- **No cross-browser matrix.** Verified in Chromium only. `backdrop-filter` and `dvh` need a Safari pass.
- **No load testing.** There is no rate limiting on `/api/generate` yet — the first thing I would add before this faced real users.
