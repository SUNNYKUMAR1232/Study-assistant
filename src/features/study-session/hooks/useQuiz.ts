"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { QuizQuestion } from "../types";

/**
 * Quiz state machine: answering -> results, with a "retest missed only" loop.
 * Scoring lives here so the components stay presentational.
 */

export type QuizPhase = "answering" | "results";

export interface UseQuizResult {
  questions: QuizQuestion[];
  current: QuizQuestion | undefined;
  index: number;
  total: number;
  phase: QuizPhase;
  /** questionId -> chosen option index */
  answers: Record<string, number>;
  selected: number | undefined;
  score: number;
  missed: QuizQuestion[];
  isRetest: boolean;
  answer: (optionIndex: number) => void;
  next: () => void;
  previous: () => void;
  finish: () => void;
  retestMissed: () => void;
  restart: () => void;
}

export function useQuiz(allQuestions: QuizQuestion[]): UseQuizResult {
  const [pool, setPool] = useState(allQuestions);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [phase, setPhase] = useState<QuizPhase>("answering");
  const [isRetest, setIsRetest] = useState(false);

  // Reset when a genuinely different quiz arrives.
  const signature = allQuestions.map((question) => question.id).join("|");
  const previousSignature = useRef(signature);
  useEffect(() => {
    if (previousSignature.current !== signature) {
      previousSignature.current = signature;
      setPool(allQuestions);
      setIndex(0);
      setAnswers({});
      setPhase("answering");
      setIsRetest(false);
    }
  }, [signature, allQuestions]);

  const total = pool.length;
  const current = pool[index];

  const score = useMemo(
    () => pool.reduce((sum, question) => sum + (answers[question.id] === question.answerIndex ? 1 : 0), 0),
    [pool, answers],
  );

  const missed = useMemo(
    () => pool.filter((question) => answers[question.id] !== question.answerIndex),
    [pool, answers],
  );

  const answer = useCallback(
    (optionIndex: number) => {
      if (!current) return;
      // First answer is final — changing it after seeing the explanation
      // would make the score meaningless.
      setAnswers((previous) =>
        current.id in previous ? previous : { ...previous, [current.id]: optionIndex },
      );
    },
    [current],
  );

  const next = useCallback(() => {
    setIndex((value) => {
      if (value >= total - 1) {
        setPhase("results");
        return value;
      }
      return value + 1;
    });
  }, [total]);

  const previous = useCallback(() => setIndex((value) => Math.max(0, value - 1)), []);
  const finish = useCallback(() => setPhase("results"), []);

  const retestMissed = useCallback(() => {
    if (missed.length === 0) return;
    setPool(missed);
    setAnswers({});
    setIndex(0);
    setPhase("answering");
    setIsRetest(true);
  }, [missed]);

  const restart = useCallback(() => {
    setPool(allQuestions);
    setAnswers({});
    setIndex(0);
    setPhase("answering");
    setIsRetest(false);
  }, [allQuestions]);

  return {
    questions: pool,
    current,
    index,
    total,
    phase,
    answers,
    selected: current ? answers[current.id] : undefined,
    score,
    missed,
    isRetest,
    answer,
    next,
    previous,
    finish,
    retestMissed,
    restart,
  };
}
