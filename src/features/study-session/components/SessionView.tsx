"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Button } from "@/shared/ui/Button";
import { Card, CardBody } from "@/shared/ui/Card";
import { DegradedNotice, Skeleton } from "@/shared/ui/states";
import { cn } from "@/shared/lib/cn";
import { FlashcardDeck } from "./FlashcardDeck";
import type { GenerationMeta, StudySession } from "../types";

/**
 * Split out because a user may only ever use the flashcards. The quiz is a
 * genuinely separate interaction, so it is worth not shipping until asked for.
 */
const QuizRunner = dynamic(() => import("./QuizRunner").then((module) => module.QuizRunner), {
  loading: () => <Skeleton className="h-64 w-full" />,
});

type Tab = "flashcards" | "quiz";

export interface SessionViewProps {
  session: StudySession;
  meta: GenerationMeta | null;
  fromCache: boolean;
  isSaved: boolean;
  onSave: () => void;
}

export function SessionView({ session, meta, fromCache, isSaved, onSave }: SessionViewProps) {
  const [tab, setTab] = useState<Tab>("flashcards");

  return (
    <section className="space-y-4" aria-label="Generated study session">
      <Card>
        <CardBody>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-balance text-xl font-semibold text-slate-900 dark:text-slate-100">
                {session.title}
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                {session.summary}
              </p>
            </div>
            <Button size="sm" variant={isSaved ? "secondary" : "ghost"} onClick={onSave} disabled={isSaved}>
              {isSaved ? "Saved" : "Save session"}
            </Button>
          </div>

          <dl className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-500">
            <Stat label="Cards" value={String(session.flashcards.length)} />
            <Stat label="Questions" value={String(session.quiz.length)} />
            {meta ? <Stat label="Model" value={meta.model} /> : null}
            {meta && !fromCache ? <Stat label="Took" value={`${(meta.elapsedMs / 1000).toFixed(1)}s`} /> : null}
            {fromCache ? <Stat label="Source" value="cached" /> : null}
          </dl>
        </CardBody>
      </Card>

      {meta?.degraded ? <DegradedNotice warnings={meta.warnings} /> : null}

      <div role="tablist" aria-label="Study mode" className="flex gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
        <TabButton id="flashcards" active={tab} onSelect={setTab}>
          Flashcards ({session.flashcards.length})
        </TabButton>
        <TabButton id="quiz" active={tab} onSelect={setTab}>
          Quiz ({session.quiz.length})
        </TabButton>
      </div>

      {/* Both panels stay mounted so deck position and quiz answers survive a
          tab switch; only the hidden one is removed from the a11y tree. */}
      <div role="tabpanel" id="panel-flashcards" hidden={tab !== "flashcards"}>
        <FlashcardDeck cards={session.flashcards} isActive={tab === "flashcards"} />
      </div>
      <div role="tabpanel" id="panel-quiz" hidden={tab !== "quiz"}>
        {tab === "quiz" ? <QuizRunner questions={session.quiz} /> : null}
      </div>
    </section>
  );
}

function TabButton({
  id,
  active,
  onSelect,
  children,
}: {
  id: Tab;
  active: Tab;
  onSelect: (tab: Tab) => void;
  children: React.ReactNode;
}) {
  const isActive = active === id;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      aria-controls={`panel-${id}`}
      onClick={() => onSelect(id)}
      className={cn(
        "min-h-10 flex-1 rounded-md px-3 text-sm font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
        isActive
          ? "bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-slate-100"
          : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200",
      )}
    >
      {children}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-1">
      <dt className="font-medium">{label}:</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
