import "server-only";

import Groq from "groq-sdk";

/**
 * Groq client construction, shared by generation and the health check.
 *
 * Keeping this in one module means the API key is read in exactly one place,
 * and swapping providers still touches a single directory.
 */

export const DEFAULT_MODEL = "openai/gpt-oss-120b";

export class MissingKeyError extends Error {
  constructor() {
    super("GROQ_API_KEY is not set on the server.");
    this.name = "MissingKeyError";
  }
}

let client: Groq | null = null;

export function getModelName(): string {
  return process.env.GROQ_MODEL || DEFAULT_MODEL;
}

export function getGroqClient(timeoutMs: number): Groq {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new MissingKeyError();

  // The health check wants a short timeout, generation a long one. Rebuild
  // rather than cache when they differ — constructing a client is cheap.
  if (!client || client.timeout !== timeoutMs) {
    client = new Groq({ apiKey, timeout: timeoutMs, maxRetries: 1 });
  }
  return client;
}
