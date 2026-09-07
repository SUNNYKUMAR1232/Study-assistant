"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
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
}

export function SessionView({ session, meta }: SessionViewProps) {
  const [tab, setTab] = useState<Tab>("flashcards");

  return (
    <section className="space-y-4" aria-label="Generated study session">
      <Card>
        <CardBody>
          <h2 className="text-balance text-xl font-semibold text-slate-900 dark:text-slate-100">
            {session.title}
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            {session.summary}
          </p>
        </CardBody>
      </Card>

      {/* A damaged-but-usable result still has to say so. */}
      {meta?.degraded ? <DegradedNotice warnings={meta.warnings} /> : null}

      <div role="tablist" aria-label="Study mode" className="flex gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
        <TabButton id="flashcards" active={tab} onSelect={setTab}>
          Flashcards ({session.flashcards.length})
        </TabButton>
        <TabButton id="quiz" active={tab} onSelect={setTab}>
          Quiz ({session.quiz.length})
        </TabButton>
      </div>

      {/* The flashcard panel stays mounted so deck position survives a tab
          switch; the quiz mounts on demand because it is a lazy chunk. */}
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
