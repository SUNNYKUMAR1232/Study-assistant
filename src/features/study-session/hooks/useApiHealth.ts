"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchWithTimeout } from "@/shared/lib/fetchWithTimeout";
import { HealthResponseSchema } from "../api/schema";
import type { HealthResponse } from "../types";

/**
 * Live connection status for the header indicator.
 *
 * Four client-side states sit on top of the server's three, because the
 * browser knows two things the server cannot: whether we are still checking,
 * and whether *this device* is offline. Reporting "server unreachable" when
 * the user's wifi dropped would send them debugging the wrong thing.
 */

export type ConnectionState = "checking" | "offline" | "connected" | "no-key" | "unreachable";

const POLL_INTERVAL_MS = 45_000;
const PROBE_TIMEOUT_MS = 8_000;

export interface UseApiHealthResult {
  state: ConnectionState;
  message: string;
  latencyMs: number | null;
  model: string | null;
  /** True while a check is in flight, even when a previous result is showing. */
  isRefreshing: boolean;
  refresh: () => void;
}

export function useApiHealth(): UseApiHealthResult {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [state, setState] = useState<ConnectionState>("checking");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [message, setMessage] = useState("Checking connection…");

  // Same stale-guard discipline as useGeneration: polls overlap, and only the
  // newest may write. A slow probe must not overwrite a newer fast one.
  const requestIdRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);

  const check = useCallback(async (force = false) => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setState("offline");
      setMessage("You are offline.");
      return;
    }

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    const requestId = ++requestIdRef.current;
    const isCurrent = () => requestId === requestIdRef.current;

    setIsRefreshing(true);
    try {
      const response = await fetchWithTimeout(`/api/health${force ? "?force=1" : ""}`, {
        signal: controller.signal,
        timeoutMs: PROBE_TIMEOUT_MS,
        cache: "no-store",
      });
      const json: unknown = await response.json().catch(() => null);
      if (!isCurrent()) return;

      const parsed = HealthResponseSchema.safeParse(json);
      if (!parsed.success) {
        setState("unreachable");
        setMessage("The server sent an unexpected health response.");
        return;
      }

      setHealth(parsed.data);
      setState(TO_CLIENT_STATE[parsed.data.status]);
      setMessage(parsed.data.message);
    } catch {
      if (controller.signal.aborted || !isCurrent()) return;
      // The health route always returns 200, so a throw means the app server
      // itself is unreachable — not that Groq is down.
      setState("unreachable");
      setMessage("Cannot reach the app server.");
    } finally {
      if (isCurrent()) setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void check();

    const timer = window.setInterval(() => void check(), POLL_INTERVAL_MS);

    // Re-check on the events that actually change the answer, rather than
    // polling aggressively: coming back to the tab, and regaining network.
    const onFocus = () => void check();
    const onOnline = () => void check(true);
    const onOffline = () => {
      setState("offline");
      setMessage("You are offline.");
    };

    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      controllerRef.current?.abort();
    };
  }, [check]);

  const refresh = useCallback(() => void check(true), [check]);

  return {
    state,
    message,
    latencyMs: health?.latencyMs ?? null,
    model: health?.model ?? null,
    isRefreshing,
    refresh,
  };
}

const TO_CLIENT_STATE = {
  ok: "connected",
  no_key: "no-key",
  unreachable: "unreachable",
} as const satisfies Record<HealthResponse["status"], ConnectionState>;
