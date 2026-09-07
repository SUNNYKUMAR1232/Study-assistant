import { normalizeStudySession } from "./normalize";
import type { GenerateResponse } from "../types";

/**
 * Failure injection for development.
 *
 * Every failure mode the app claims to survive is reachable from the UI in
 * one click, which is the only honest way to demonstrate error handling
 * without waiting for the model to misbehave on camera.
 *
 * Disabled entirely in production so it can never be triggered by a caller.
 */

export const CHAOS_MODES = [
  "off",
  "malformed-json",
  "wrong-shape",
  "empty",
  "partial",
  "slow",
  "rate-limit",
  "upstream-error",
] as const;

export type ChaosMode = (typeof CHAOS_MODES)[number];

export const CHAOS_HEADER = "x-chaos-mode";

export function resolveChaosMode(request: Request): Exclude<ChaosMode, "off"> | null {
  if (process.env.NODE_ENV === "production") return null;

  const value = request.headers.get(CHAOS_HEADER);
  if (!value || value === "off") return null;

  return (CHAOS_MODES as readonly string[]).includes(value)
    ? (value as Exclude<ChaosMode, "off">)
    : null;
}

/** Model output that is broken in a specific, named way. */
const BROKEN_PAYLOADS: Record<string, string> = {
  "malformed-json":
    'Sure! Here is your study session:\n```json\n{ "title": "Cell Biology", "flashcards": [ { "id": "c1", "front": "What is ATP?" ',
  "wrong-shape": JSON.stringify({
    title: "Cell Biology",
    cards: [{ q: "What is ATP?", a: "Energy currency" }],
    questions: "several",
  }),
  empty: "",
  partial: JSON.stringify({
    title: "Cell Biology",
    summary: "A short tour of cellular energy.",
    flashcards: [
      { id: "c1", front: "What is ATP?", back: "The cell's energy currency." },
      { id: "c2", front: "", back: "" },
      { id: "c2", front: "Where is ATP made?", back: "In the mitochondria." },
    ],
    quiz: [
      {
        id: "q1",
        question: "Which organelle produces most ATP?",
        options: ["Ribosome", "Mitochondrion", "Nucleus", "Golgi body"],
        answer: "B",
        explanation: "Oxidative phosphorylation happens in the mitochondrion.",
      },
      { id: "q2", question: "Incomplete question", options: ["only", "two"], answerIndex: 9 },
    ],
  }),
};

/** Longer than the client's 45s timeout, so the abort path runs for real. */
const SLOW_DELAY_MS = 60_000;

/**
 * Always returns a response. A chaos mode must never fall through to the real
 * provider — picking "slow" in a dropdown should not spend API quota.
 */
export async function chaosResponse(
  mode: Exclude<ChaosMode, "off">,
  signal?: AbortSignal,
): Promise<GenerateResponse> {
  if (mode === "slow") {
    await sleep(SLOW_DELAY_MS, signal);
    return { ok: false, error: { code: "timeout", message: "The model took too long to respond." } };
  }
  if (mode === "rate-limit") {
    return { ok: false, error: { code: "rate_limited", message: "Groq is rate limiting us. Try again shortly." } };
  }
  if (mode === "upstream-error") {
    return { ok: false, error: { code: "upstream_error", message: "Groq could not complete the request." } };
  }

  // The remaining modes feed broken text through the real normaliser, so what
  // you see in the UI is genuine recovery behaviour, not a canned screen.
  const raw = BROKEN_PAYLOADS[mode] ?? "";
  const normalized = normalizeStudySession(raw);

  if (!normalized.ok) {
    return { ok: false, error: { code: "unparseable", message: normalized.reason } };
  }
  return {
    ok: true,
    data: normalized.data,
    meta: {
      model: `chaos:${mode}`,
      elapsedMs: 0,
      degraded: normalized.degraded,
      warnings: normalized.warnings,
    },
  };
}

/**
 * Abort-aware sleep. A plain setTimeout would keep the handler alive for the
 * full delay after the client has already disconnected.
 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();

    const finish = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", finish);
      resolve();
    };

    const timer = setTimeout(finish, ms);
    signal?.addEventListener("abort", finish, { once: true });
  });
}
