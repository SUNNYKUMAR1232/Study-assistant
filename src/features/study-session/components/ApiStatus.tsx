"use client";

import { cn } from "@/shared/lib/cn";
import { useApiHealth, type ConnectionState } from "../hooks/useApiHealth";

/**
 * Live connection indicator.
 *
 * A missing or rejected API key used to surface only after the user had
 * pasted a paragraph and hit generate. This says so up front.
 */

const PRESENTATION: Record<
  ConnectionState,
  { label: string; dot: string; text: string; pulse: boolean }
> = {
  checking: {
    label: "Checking…",
    dot: "bg-slate-400",
    text: "text-slate-500 dark:text-slate-400",
    pulse: true,
  },
  connected: {
    label: "API connected",
    dot: "bg-emerald-500",
    text: "text-emerald-700 dark:text-emerald-400",
    pulse: true,
  },
  offline: {
    label: "You are offline",
    dot: "bg-slate-400",
    text: "text-slate-500 dark:text-slate-400",
    pulse: false,
  },
  "no-key": {
    label: "No API key",
    dot: "bg-amber-500",
    text: "text-amber-700 dark:text-amber-400",
    pulse: false,
  },
  unreachable: {
    label: "API unreachable",
    dot: "bg-rose-500",
    text: "text-rose-700 dark:text-rose-400",
    pulse: false,
  },
};

export function ApiStatus() {
  const health = useApiHealth();
  const view = PRESENTATION[health.state];
  const isProblem = health.state === "no-key" || health.state === "unreachable";

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={health.refresh}
        // aria-live announces the change to screen readers when it flips,
        // rather than only on focus.
        aria-live="polite"
        title={`${health.message} Click to re-check.`}
        className={cn(
          "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
          "border-slate-200 bg-white hover:bg-slate-50",
          "dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
          view.text,
        )}
      >
        <span className="relative flex size-2">
          {view.pulse ? (
            <span
              className={cn(
                "absolute inline-flex size-full animate-ping rounded-full opacity-75",
                "motion-reduce:animate-none",
                view.dot,
              )}
            />
          ) : null}
          <span className={cn("relative inline-flex size-2 rounded-full", view.dot)} />
        </span>

        <span>{view.label}</span>

        {health.state === "connected" && health.latencyMs !== null ? (
          <span className="tabular-nums text-slate-400 dark:text-slate-500">{health.latencyMs}ms</span>
        ) : null}

        {health.isRefreshing && health.state !== "checking" ? (
          <span className="sr-only">Re-checking connection</span>
        ) : null}
      </button>

      {/* Only a real problem earns extra vertical space. */}
      {isProblem ? (
        <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          {health.message}
        </p>
      ) : null}
    </div>
  );
}
