"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { fetchWithTimeout } from "@/shared/lib/fetchWithTimeout";
import { hashText } from "@/shared/lib/hashText";
import { readJSON, writeJSON } from "@/shared/lib/storage";
import { GenerateResponseSchema } from "../api/schema";
import { CHAOS_HEADER, type ChaosMode } from "../api/chaos";
import type { ApiError, GenerateRequestInput, GenerationMeta, StudySession } from "../types";

/**
 * The single owner of network state. No component calls fetch; they receive
 * this hook's state as props and emit callbacks back into it.
 *
 * Three things here are deliberate and worth reading closely:
 *   1. a monotonic request id, so a slow response can never overwrite a newer one
 *   2. an AbortController per request, cancelled on a new run and on unmount
 *   3. a localStorage cache, so an identical input is never re-billed
 */

const CACHE_PREFIX = "study-assistant:v1:";
const CLIENT_TIMEOUT_MS = 45_000;

type Status = "idle" | "loading" | "success" | "error";

interface State {
  status: Status;
  data: StudySession | null;
  meta: GenerationMeta | null;
  error: ApiError | null;
  /** True when the visible result came from cache rather than a fresh call. */
  fromCache: boolean;
  /**
   * True when the result was re-opened from saved history rather than produced
   * by this session. Callers use it to avoid re-recording what they just read.
   */
  restored: boolean;
}

type Action =
  | { type: "start" }
  | { type: "resolve"; data: StudySession; meta: GenerationMeta; fromCache: boolean; restored?: boolean }
  | { type: "reject"; error: ApiError }
  | { type: "reset" };

const INITIAL_STATE: State = {
  status: "idle",
  data: null,
  meta: null,
  error: null,
  fromCache: false,
  restored: false,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "start":
      // Keep the previous result on screen while the next one loads; the UI
      // decides whether to dim it. Clearing here would cause a content flash.
      return { ...state, status: "loading", error: null };
    case "resolve":
      return {
        status: "success",
        data: action.data,
        meta: action.meta,
        error: null,
        fromCache: action.fromCache,
        restored: action.restored ?? false,
      };
    case "reject":
      return { ...state, status: "error", error: action.error };
    case "reset":
      return INITIAL_STATE;
  }
}

interface CachedEntry {
  data: StudySession;
  meta: GenerationMeta;
}

function cacheKey(request: GenerateRequestInput): string {
  const { text, flashcardCount, quizCount, difficulty } = request;
  return CACHE_PREFIX + hashText([text, flashcardCount, quizCount, difficulty].join("|"));
}

export interface UseGenerationResult extends State {
  isLoading: boolean;
  generate: (request: GenerateRequestInput, options?: { chaos?: ChaosMode; force?: boolean }) => void;
  retry: () => void;
  reset: () => void;
  loadSession: (data: StudySession, meta: GenerationMeta) => void;
}

export function useGeneration(): UseGenerationResult {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);

  const requestIdRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const lastArgsRef = useRef<{ request: GenerateRequestInput; chaos?: ChaosMode } | null>(null);

  // A component that unmounts mid-flight must not leave a request running.
  useEffect(() => {
    return () => controllerRef.current?.abort();
  }, []);

  const generate = useCallback<UseGenerationResult["generate"]>((request, options = {}) => {
    const { chaos, force = false } = options;

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    // Claim the next id. Any response carrying an older id is discarded below.
    const requestId = ++requestIdRef.current;
    const isCurrent = () => requestId === requestIdRef.current;

    lastArgsRef.current = { request, chaos };
    dispatch({ type: "start" });

    const key = cacheKey(request);
    if (!force && !chaos) {
      const cached = readJSON<CachedEntry>(key);
      if (cached?.data) {
        dispatch({ type: "resolve", data: cached.data, meta: cached.meta, fromCache: true });
        return;
      }
    }

    void (async () => {
      try {
        const response = await fetchWithTimeout("/api/generate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(chaos && chaos !== "off" ? { [CHAOS_HEADER]: chaos } : {}),
          },
          body: JSON.stringify(request),
          signal: controller.signal,
          timeoutMs: CLIENT_TIMEOUT_MS,
        });

        const json: unknown = await response.json().catch(() => null);
        if (!isCurrent()) return;

        // The server's own response is validated too. A deployed version that
        // drifts from the contract is treated as a failure, not rendered blind.
        const parsed = GenerateResponseSchema.safeParse(json);
        if (!parsed.success) {
          dispatch({
            type: "reject",
            error: { code: "unparseable", message: "The server sent an unexpected response." },
          });
          return;
        }

        if (!parsed.data.ok) {
          dispatch({ type: "reject", error: parsed.data.error });
          return;
        }

        if (!chaos) writeJSON(key, { data: parsed.data.data, meta: parsed.data.meta });
        dispatch({
          type: "resolve",
          data: parsed.data.data,
          meta: parsed.data.meta,
          fromCache: false,
        });
      } catch (error) {
        // A request we cancelled ourselves is not an error the user should see.
        // (A timeout aborts a different, internal controller, so it still lands here.)
        if (controller.signal.aborted || !isCurrent()) return;

        dispatch({ type: "reject", error: toClientError(error) });
      }
    })();
  }, []);

  const retry = useCallback(() => {
    const last = lastArgsRef.current;
    if (last) generate(last.request, { chaos: last.chaos, force: true });
  }, [generate]);

  const reset = useCallback(() => {
    requestIdRef.current++; // invalidate anything in flight
    controllerRef.current?.abort();
    lastArgsRef.current = null;
    dispatch({ type: "reset" });
  }, []);

  const loadSession = useCallback((data: StudySession, meta: GenerationMeta) => {
    requestIdRef.current++;
    controllerRef.current?.abort();
    dispatch({ type: "resolve", data, meta, fromCache: true, restored: true });
  }, []);

  return {
    ...state,
    isLoading: state.status === "loading",
    generate,
    retry,
    reset,
    loadSession,
  };
}

function toClientError(error: unknown): ApiError {
  const message = error instanceof Error ? error.message : "";
  if (message === "timeout") {
    return { code: "timeout", message: "That took too long. The model may be busy — try again." };
  }
  return {
    code: "upstream_error",
    message: "Could not reach the server. Check your connection and try again.",
  };
}
