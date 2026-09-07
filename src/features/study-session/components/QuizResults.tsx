"use client";

import { Button } from "@/shared/ui/Button";
import { Card, CardBody } from "@/shared/ui/Card";
import { cn } from "@/shared/lib/cn";
import { RichText } from "@/shared/ui/RichText";
import type { QuizQuestion } from "../types";

export interface QuizResultsProps {
  questions: QuizQuestion[];
  answers: Record<string, number>;
  score: number;
  missed: QuizQuestion[];
  isRetest: boolean;
  onRetestMissed: () => void;
  onRestart: () => void;
}

export function QuizResults({
  questions,
  answers,
  score,
  missed,
  isRetest,
  onRetestMissed,
  onRestart,
}: QuizResultsProps) {
  const total = questions.length;
  const percent = total > 0 ? Math.round((score / total) * 100) : 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="text-center">
          <p className="text-sm font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {isRetest ? "Retest complete" : "Quiz complete"}
          </p>
          {/* Scored out of 100 so a 5-question quiz and a 15-question one
              are directly comparable. */}
          <p className="mt-2 text-5xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
            {percent}
            <span className="text-2xl text-slate-400 dark:text-slate-600">/100</span>
          </p>
          <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
            {score} of {total} correct · {verdict(percent)}
          </p>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
            {missed.length > 0 ? (
              <Button onClick={onRetestMissed}>Retest {missed.length} missed</Button>
            ) : null}
            <Button variant="secondary" onClick={onRestart}>
              Restart full quiz
            </Button>
          </div>
        </CardBody>
      </Card>

      <ol className="space-y-3">
        {questions.map((question, questionIndex) => {
          const given = answers[question.id];
          const isCorrect = given === question.answerIndex;
          return (
            <li key={question.id}>
              <Card
                className={cn(
                  "border-l-4",
                  isCorrect
                    ? "border-l-emerald-500"
                    : "border-l-rose-500",
                )}
              >
                <CardBody>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {questionIndex + 1}. {question.question}
                  </p>
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                    <span className="font-semibold">Correct:</span>{" "}
                    {question.options[question.answerIndex]}
                  </p>
                  {!isCorrect ? (
                    <p className="mt-1 text-sm text-rose-700 dark:text-rose-400">
                      <span className="font-semibold">You chose:</span>{" "}
                      {given === undefined ? "nothing" : question.options[given]}
                    </p>
                  ) : null}
                  <RichText
                    value={question.explanation}
                    align="left"
                    className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400"
                  />
                </CardBody>
              </Card>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function verdict(percent: number): string {
  if (percent === 100) return "Nothing left to review";
  if (percent >= 80) return "Nearly there";
  if (percent >= 50) return "Worth another pass";
  return "Go back over the material";
}
