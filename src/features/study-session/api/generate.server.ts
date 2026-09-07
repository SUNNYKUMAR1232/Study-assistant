import "server-only";

import Groq from "groq-sdk";
import { normalizeStudySession } from "./normalize";
import { SAVE_SESSION_TOOL, buildSystemPrompt, buildUserPrompt } from "./prompt";
import type { ApiError, GenerateRequest, GenerationMeta, StudySession } from "../types";

/**
 * The only module that talks to Groq. Nothing above it knows which provider
 * we use; nothing below it knows about HTTP. Swapping Groq for another
 * provider means editing this file and nothing else.
 */

const DEFAULT_MODEL = "llama-3.3-70b-versatile";
const UPSTREAM_TIMEOUT_MS = 40_000;

export type GenerateOutcome =
  | { ok: true; data: StudySession; meta: GenerationMeta }
  | { ok: false; error: ApiError };

let client: Groq | null = null;

function getClient(): Groq {
  if (!client) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new MissingKeyError();
    client = new Groq({ apiKey, timeout: UPSTREAM_TIMEOUT_MS, maxRetries: 1 });
  }
  return client;
}

class MissingKeyError extends Error {
  constructor() {
    super("GROQ_API_KEY is not set on the server.");
    this.name = "MissingKeyError";
  }
}

export async function generateStudySession(
  request: GenerateRequest,
  signal?: AbortSignal,
): Promise<GenerateOutcome> {
  const model = process.env.GROQ_MODEL || DEFAULT_MODEL;
  const startedAt = Date.now();

  let completion;
  try {
    completion = await getClient().chat.completions.create(
      {
        model,
        temperature: 0.4,
        max_tokens: 4096,
        messages: [
          { role: "system", content: buildSystemPrompt() },
          { role: "user", content: buildUserPrompt(request) },
        ],
        tools: [SAVE_SESSION_TOOL],
        // Force the call: the model cannot answer in prose even if it wants to.
        tool_choice: { type: "function", function: { name: SAVE_SESSION_TOOL.function.name } },
      },
      { signal },
    );
  } catch (error) {
    return { ok: false, error: toApiError(error) };
  }

  const message = completion.choices[0]?.message;
  const toolCall = message?.tool_calls?.[0];

  // Tool arguments are still model-generated text, so they go through the same
  // normaliser as a plain-content fallback would.
  const payload = toolCall?.function.arguments ?? message?.content ?? "";
  if (!payload.trim()) {
    return {
      ok: false,
      error: { code: "unparseable", message: "The model returned an empty response." },
    };
  }

  const normalized = normalizeStudySession(payload);
  if (!normalized.ok) {
    return { ok: false, error: { code: "unparseable", message: normalized.reason } };
  }

  return {
    ok: true,
    data: normalized.data,
    meta: {
      model,
      elapsedMs: Date.now() - startedAt,
      degraded: normalized.degraded,
      warnings: normalized.warnings,
    },
  };
}

/** Map every upstream failure onto a code the client already knows how to render. */
function toApiError(error: unknown): ApiError {
  if (error instanceof MissingKeyError) {
    return { code: "server_error", message: "The server is missing its Groq API key." };
  }
  if (error instanceof Groq.APIError) {
    if (error.status === 429) {
      return { code: "rate_limited", message: "Groq is rate limiting us. Try again shortly." };
    }
    if (error.status === 401 || error.status === 403) {
      return { code: "server_error", message: "The server's Groq API key was rejected." };
    }
    return { code: "upstream_error", message: "Groq could not complete the request." };
  }
  if (isAbortLike(error)) {
    return { code: "timeout", message: "The model took too long to respond." };
  }
  return { code: "upstream_error", message: "Something went wrong talking to the model." };
}

function isAbortLike(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const name = "name" in error ? String(error.name) : "";
  return name === "AbortError" || name === "APIConnectionTimeoutError" || name === "TimeoutError";
}
