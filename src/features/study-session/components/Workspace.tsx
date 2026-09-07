"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/shared/lib/cn";
import { ErrorState, LoadingState } from "@/shared/ui/states";
import { AppShell } from "./AppShell";
import { InputPanel } from "./InputPanel";
import { SessionView } from "./SessionView";
import { Sidebar } from "./Sidebar";
import { useComposerDraft } from "../hooks/useComposerDraft";
import { useGeneration } from "../hooks/useGeneration";
import { useSessionLibrary, type StoredSession } from "../hooks/useSessionLibrary";
import type { ApiError, GenerationMeta, StudySession } from "../types";

/**
 * Owns the wiring and the one piece of navigation state; every other piece
 * of state lives in a hook and every pixel lives in a component.
 *
 * Two screens, not one scrolling page: you compose, then you study. Stacking
 * the results under the form pushed the thing you asked for below the fold
 * on a phone.
 */

type Screen = "composer" | "session";

export function Workspace() {
  const generation = useGeneration();
  const library = useSessionLibrary();
  const composer = useComposerDraft();

  const [screen, setScreen] = useState<Screen>("composer");
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const isDev = process.env.NODE_ENV !== "production";

  // Persist every successful generation. Re-opening a stored session replays
  // the same data, and `record` de-duplicates rather than cloning it.
  useEffect(() => {
    if (generation.status === "success" && generation.data && generation.meta) {
      library.record(generation.data, generation.meta);
    }
  }, [generation.status, generation.data, generation.meta, library]);

  const closeDrawer = useCallback(() => setIsDrawerOpen(false), []);

  const handleSubmit = useCallback(() => {
    const { text, flashcardCount, quizCount, difficulty, chaos } = composer.draft;
    generation.generate({ text: text.trim(), flashcardCount, quizCount, difficulty }, { chaos });
    // Move to the results screen immediately, so the loading state happens
    // where the result will appear rather than somewhere the user has left.
    setScreen("session");
  }, [composer.draft, generation]);

  /** Return to the composer with the draft intact. Nothing is discarded. */
  const handleBack = useCallback(() => {
    setScreen("composer");
    closeDrawer();
  }, [closeDrawer]);

  /** Start over: clears the result, the draft, and the active selection. */
  const handleNewSession = useCallback(() => {
    generation.reset();
    composer.reset();
    library.setActiveId(null);
    setScreen("composer");
    closeDrawer();
  }, [generation, composer, library, closeDrawer]);

  const handleOpenSession = useCallback(
    (session: StoredSession) => {
      generation.loadSession(session.data, session.meta);
      library.setActiveId(session.id);
      setScreen("session");
      closeDrawer();
    },
    [generation, library, closeDrawer],
  );

  const handleRemoveSession = useCallback(
    (id: string) => {
      const wasActive = library.activeId === id;
      library.remove(id);
      // Deleting the session you are looking at should not leave it on screen.
      if (wasActive) {
        generation.reset();
        setScreen("composer");
      }
    },
    [generation, library],
  );

  const title = screen === "session" && generation.data ? generation.data.title : "New study session";

  return (
    <AppShell
      title={title}
      isDrawerOpen={isDrawerOpen}
      onOpenDrawer={() => setIsDrawerOpen(true)}
      onCloseDrawer={closeDrawer}
      sidebar={
        <Sidebar
          sessions={library.sessions}
          activeId={library.activeId}
          isLoaded={library.isLoaded}
          onNewSession={handleNewSession}
          onOpenSession={handleOpenSession}
          onRemoveSession={handleRemoveSession}
        />
      }
    >
      <div className="mx-auto w-full max-w-3xl px-4 py-5 sm:py-8">
        {screen === "composer" ? (
          <ComposerScreen
            draft={composer.draft}
            onChange={composer.update}
            isLoading={generation.isLoading}
            showChaosControls={isDev}
            onSubmit={handleSubmit}
            onCancel={generation.reset}
          />
        ) : (
          <SessionScreen
            isLoading={generation.isLoading}
            data={generation.data}
            meta={generation.meta}
            error={generation.status === "error" ? generation.error : null}
            onRetry={generation.retry}
            onBack={handleBack}
          />
        )}
      </div>
    </AppShell>
  );
}

function ComposerScreen({
  draft,
  onChange,
  isLoading,
  showChaosControls,
  onSubmit,
  onCancel,
}: {
  draft: ReturnType<typeof useComposerDraft>["draft"];
  onChange: ReturnType<typeof useComposerDraft>["update"];
  isLoading: boolean;
  showChaosControls: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="hidden lg:block">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          New study session
        </h1>
        <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
          Paste anything you need to learn. Get flashcards and a quiz you can actually work through.
        </p>
      </div>

      <InputPanel
        draft={draft}
        onChange={onChange}
        isLoading={isLoading}
        showChaosControls={showChaosControls}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />

      <p className="text-center text-xs text-slate-400 dark:text-slate-600">
        Generated content can be wrong. Check it against your source material.
      </p>
    </div>
  );
}

function SessionScreen({
  isLoading,
  data,
  meta,
  error,
  onRetry,
  onBack,
}: {
  isLoading: boolean;
  data: StudySession | null;
  meta: GenerationMeta | null;
  error: ApiError | null;
  onRetry: () => void;
  onBack: () => void;
}) {
  const body = () => {
    // A first load with nothing to show is the only full skeleton case; a
    // refresh over existing content dims it instead.
    if (isLoading && !data) return <LoadingState />;

    if (error && !data) return <ErrorState message={error.message} onRetry={onRetry} />;
    if (!data) return null;

    return (
      <>
        {error ? <ErrorState message={error.message} onRetry={onRetry} /> : null}
        <div className={isLoading ? "opacity-50 transition-opacity" : undefined}>
          <SessionView session={data} meta={meta} />
        </div>
      </>
    );
  };

  return (
    <div className="space-y-4">
      {/* Back is the only navigation here. Starting a new session is the
          sidebar's job, and having both invited the wrong one to be clicked. */}
      <BackButton onClick={onBack} />
      {body()}
    </div>
  );
}

/** Returns to the composer with the draft intact, so it is genuinely "back". */
function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium",
        "text-slate-600 transition-colors hover:bg-slate-200/70 hover:text-slate-900",
        "dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
      )}
    >
      <svg
        viewBox="0 0 24 24"
        className="size-4 transition-transform group-hover:-translate-x-0.5 motion-reduce:transition-none"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Back to editor
    </button>
  );
}
