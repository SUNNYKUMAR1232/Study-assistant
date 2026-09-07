"use client";

import { Button } from "@/shared/ui/Button";
import { Card, CardBody } from "@/shared/ui/Card";
import { ProgressBar } from "@/shared/ui/ProgressBar";
import { EmptyState } from "@/shared/ui/states";
import { cn } from "@/shared/lib/cn";
import { RichText } from "@/shared/ui/RichText";
import { useQuiz } from "../hooks/useQuiz";
import { QuizResults } from "./QuizResults";
import type { QuizQuestion } from "../types";

const LETTERS = ["A", "B", "C", "D"] as const;

export function QuizRunner({ questions }: { questions: QuizQuestion[] }) {
  const quiz = useQuiz(questions);

  if (quiz.total === 0) {
    return (
      <EmptyState
        icon="📝"
        title="No quiz for this session"
        description="The model did not return any valid questions. The flashcards above are still usable."
      />
    );
  }

  if (quiz.phase === "results") {
    return (
      <QuizResults
        questions={quiz.questions}
        answers={quiz.answers}
        score={quiz.score}
        missed={quiz.missed}
        isRetest={quiz.isRetest}
        onRetestMissed={quiz.retestMissed}
        onRestart={quiz.restart}
      />
    );
  }

  const question = quiz.current;
  if (!question) return null;

  const hasAnswered = quiz.selected !== undefined;
  const isLast = quiz.index === quiz.total - 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-slate-600 tabular-nums dark:text-slate-400">
          Question {quiz.index + 1} of {quiz.total}
          {quiz.isRetest ? " · retest" : ""}
        </p>
        <p className="text-sm text-slate-500 tabular-nums dark:text-slate-400">
          {quiz.score} correct
        </p>
      </div>

      <ProgressBar value={quiz.index + 1} max={quiz.total} label="Quiz progress" />

      <Card>
        <CardBody>
          <h3 className="text-balance text-lg font-medium text-slate-900 dark:text-slate-100">
            {question.question}
          </h3>

          <div role="group" aria-label="Answer options" className="mt-4 space-y-2">
            {question.options.map((option, optionIndex) => (
              <OptionButton
                key={`${question.id}-${optionIndex}`}
                letter={LETTERS[optionIndex] ?? "?"}
                text={option}
                isSelected={quiz.selected === optionIndex}
                isCorrect={optionIndex === question.answerIndex}
                revealed={hasAnswered}
                onClick={() => quiz.answer(optionIndex)}
              />
            ))}
          </div>

          {hasAnswered ? (
            <div
              role="status"
              className="mt-4 rounded-lg bg-slate-50 p-3 text-sm leading-relaxed text-slate-700 dark:bg-slate-800/60 dark:text-slate-300"
            >
              {/* The verdict gets its own line: an explanation that turns out
                  to be a list cannot sit inline after it. */}
              <p className="font-semibold">
                {quiz.selected === question.answerIndex ? "Correct." : "Not quite."}
              </p>
              <RichText value={question.explanation} align="left" className="mt-1" />
            </div>
          ) : null}
        </CardBody>
      </Card>

      <div className="flex gap-2">
        <Button variant="secondary" onClick={quiz.previous} disabled={quiz.index === 0} className="flex-1">
          Back
        </Button>
        <Button onClick={isLast ? quiz.finish : quiz.next} disabled={!hasAnswered} className="flex-1">
          {isLast ? "See results" : "Next"}
        </Button>
      </div>
    </div>
  );
}

function OptionButton({
  letter,
  text,
  isSelected,
  isCorrect,
  revealed,
  onClick,
}: {
  letter: string;
  text: string;
  isSelected: boolean;
  isCorrect: boolean;
  revealed: boolean;
  onClick: () => void;
}) {
  // After answering, colour communicates the outcome — but the icon and the
  // screen-reader text carry it too, so colour is never the only signal.
  const state = !revealed
    ? "idle"
    : isCorrect
      ? "correct"
      : isSelected
        ? "wrong"
        : "muted";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={revealed}
      aria-pressed={isSelected}
      className={cn(
        "flex w-full items-start gap-3 rounded-lg border p-3 text-left text-sm transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
        "disabled:cursor-default",
        // Neutral until answered, so the first colour on this screen is the
        // emerald or rose that tells you whether you were right.
        state === "idle" &&
          "border-slate-300 bg-white hover:border-slate-400 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600 dark:hover:bg-slate-800",
        state === "correct" &&
          "border-emerald-500 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-200",
        state === "wrong" &&
          "border-rose-500 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-200",
        state === "muted" && "border-slate-200 bg-white opacity-60 dark:border-slate-800 dark:bg-slate-900",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-bold",
          state === "correct"
            ? "bg-emerald-600 text-white"
            : state === "wrong"
              ? "bg-rose-600 text-white"
              : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200",
        )}
      >
        {state === "correct" ? "✓" : state === "wrong" ? "✕" : letter}
      </span>
      <span className="pt-0.5 text-slate-900 dark:text-slate-100">
        {text}
        {revealed && isCorrect ? <span className="sr-only"> (correct answer)</span> : null}
        {revealed && isSelected && !isCorrect ? <span className="sr-only"> (your answer, incorrect)</span> : null}
      </span>
    </button>
  );
}
