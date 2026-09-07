"use client";

import { useEffect } from "react";
import { ErrorState } from "@/shared/ui/states";

/**
 * Last line of defence. The hooks handle every failure we anticipate; this
 * catches the ones we did not, so a render bug shows a recovery button
 * instead of a blank page.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled error in Study Assistant:", error);
  }, [error]);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <ErrorState
        title="Something broke"
        message="An unexpected error stopped the page from rendering. Reloading the view usually clears it."
        onRetry={reset}
        retryLabel="Reload the view"
      />
    </main>
  );
}
