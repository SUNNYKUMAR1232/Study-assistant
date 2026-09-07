import type { ReactNode } from "react";
import { cn } from "@/shared/lib/cn";
import { Button } from "./Button";
import { Card } from "./Card";

/**
 * The three states every async surface owes the user: loading, empty, error.
 * Defined once so they cannot drift apart across the app.
 */

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-slate-200 motion-reduce:animate-none dark:bg-slate-800",
        className,
      )}
    />
  );
}

/** Mirrors the real result layout, so nothing jumps when content arrives. */
export function LoadingState({ label = "Generating your study session…" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="space-y-4">
      <span className="sr-only">{label}</span>
      <Card className="p-5">
        <Skeleton className="h-5 w-2/5" />
        <Skeleton className="mt-3 h-4 w-full" />
        <Skeleton className="mt-2 h-4 w-4/5" />
      </Card>
      <Card className="p-5">
        <Skeleton className="mx-auto h-40 w-full sm:h-52" />
        <div className="mt-4 flex justify-center gap-2">
          <Skeleton className="h-11 w-24" />
          <Skeleton className="h-11 w-24" />
        </div>
      </Card>
      <p className="text-center text-sm text-slate-500 dark:text-slate-400">{label}</p>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon?: ReactNode;
}) {
  return (
    <Card className="border-dashed p-8 text-center">
      {icon ? <div className="mb-3 flex justify-center text-3xl">{icon}</div> : null}
      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500 dark:text-slate-400">{description}</p>
    </Card>
  );
}

export function ErrorState({
  title = "That did not work",
  message,
  onRetry,
  retryLabel = "Try again",
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <Card
      role="alert"
      className="border-rose-200 bg-rose-50 p-5 text-center dark:border-rose-900/60 dark:bg-rose-950/40"
    >
      <h2 className="text-base font-semibold text-rose-900 dark:text-rose-200">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-rose-800 dark:text-rose-300">{message}</p>
      {onRetry ? (
        <Button variant="danger" className="mt-4" onClick={onRetry}>
          {retryLabel}
        </Button>
      ) : null}
    </Card>
  );
}

/** Non-blocking notice for a result that arrived damaged but usable. */
export function DegradedNotice({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;
  return (
    <div
      role="status"
      className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200"
    >
      <p className="font-medium">Partial result</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5">
        {warnings.map((warning) => (
          <li key={warning}>{warning}</li>
        ))}
      </ul>
    </div>
  );
}
