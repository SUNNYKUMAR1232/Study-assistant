import "server-only";

import Groq from "groq-sdk";
import { MissingKeyError, getGroqClient, getModelName } from "./groqClient.server";
import type { HealthResponse } from "../types";

/**
 * Is the server actually able to reach Groq right now?
 *
 * Deliberately probes `models.list()` rather than a chat completion: it is a
 * cheap metadata call that consumes no token quota, but it still proves the
 * key is valid and the network path is open — which a mere `process.env`
 * check cannot.
 */

const PROBE_TIMEOUT_MS = 6_000;
/** Clients poll on a shorter cycle than this, so the cache absorbs the load. */
const CACHE_TTL_MS = 60_000;

let cached: { result: HealthResponse; expiresAt: number } | null = null;

export async function checkHealth(force = false): Promise<HealthResponse> {
  const now = Date.now();
  if (!force && cached && cached.expiresAt > now) return cached.result;

  const result = await probe();
  cached = { result, expiresAt: Date.now() + CACHE_TTL_MS };
  return result;
}

async function probe(): Promise<HealthResponse> {
  const model = getModelName();
  const startedAt = Date.now();

  try {
    // Constructing the client throws if the key is absent.
    const client = getGroqClient(PROBE_TIMEOUT_MS);
    await client.models.list();

    return {
      status: "ok",
      model,
      latencyMs: Date.now() - startedAt,
      message: "Connected to Groq.",
      checkedAt: Date.now(),
    };
  } catch (error) {
    return {
      status: error instanceof MissingKeyError ? "no_key" : "unreachable",
      model,
      latencyMs: null,
      message: describe(error),
      checkedAt: Date.now(),
    };
  }
}

/** Never leak key material or raw SDK internals to the browser. */
function describe(error: unknown): string {
  if (error instanceof MissingKeyError) {
    return "No API key on the server. Add GROQ_API_KEY to .env.local and restart.";
  }
  if (error instanceof Groq.APIError) {
    if (error.status === 401 || error.status === 403) return "Groq rejected the server's API key.";
    if (error.status === 429) return "Connected, but Groq is currently rate limiting this key.";
    return "Groq responded with an error.";
  }
  return "Could not reach Groq from the server.";
}
