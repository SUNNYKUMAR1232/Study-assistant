"use client";

import { InputPanel } from "@/features/study-session/components/InputPanel";
import { SavedSessionsList } from "@/features/study-session/components/SavedSessionsList";
import { SessionView } from "@/features/study-session/components/SessionView";
import { useGeneration } from "@/features/study-session/hooks/useGeneration";
import { useSavedSessions } from "@/features/study-session/hooks/useSavedSessions";
import { EmptyState, ErrorState, LoadingState } from "@/shared/ui/states";
import type { ChaosMode } from "@/features/study-session/api/chaos";
import type { GenerateRequestInput } from "@/features/study-session/types";

/**
 * Owns layout and wiring only. Every piece of state lives in a hook, and
 * every piece of rendering lives in a component.
 */
export default function HomePage() {
  const generation = useGeneration();
  const saved = useSavedSessions();

  const isDev = process.env.NODE_ENV !== "production";

  function handleGenerate(request: GenerateRequestInput, chaos: ChaosMode) {
    generation.generate(request, { chaos });
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6 sm:py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl dark:text-slate-100">
          Study Assistant
        </h1>
        <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
          Paste anything you need to learn. Get flashcards and a quiz you can actually work through.
        </p>
      </header>

      <div className="space-y-6">
        <InputPanel
          isLoading={generation.isLoading}
          showChaosControls={isDev}
          onGenerate={handleGenerate}
          onCancel={generation.reset}
        />

        <SavedSessionsList
          sessions={saved.sessions}
          onOpen={(session) => generation.loadSession(session.data, session.meta)}
          onRemove={saved.remove}
        />

        {/* One place decides which of the four states is on screen. */}
        {generation.status === "loading" && !generation.data ? <LoadingState /> : null}

        {generation.status === "error" && generation.error ? (
          <ErrorState message={generation.error.message} onRetry={generation.retry} />
        ) : null}

        {generation.data ? (
          <div className={generation.isLoading ? "opacity-50 transition-opacity" : undefined}>
            <SessionView
              session={generation.data}
              meta={generation.meta}
              fromCache={generation.fromCache}
              isSaved={saved.isSaved(generation.data.title)}
              onSave={() => {
                if (generation.data && generation.meta) saved.save(generation.data, generation.meta);
              }}
            />
          </div>
        ) : null}

        {generation.status === "idle" && saved.sessions.length === 0 ? (
          <EmptyState
            icon="📚"
            title="Nothing to study yet"
            description="Paste at least a paragraph of notes above, then generate. Your last result is cached, so reloading is free."
          />
        ) : null}
      </div>

      <footer className="mt-10 text-center text-xs text-slate-400 dark:text-slate-600">
        Generated content can be wrong. Check it against your source material.
      </footer>
    </main>
  );
}
