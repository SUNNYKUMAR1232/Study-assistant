"use client";

import { useCallback, useState } from "react";
import type { ChaosMode } from "../dev/chaos";
import type { Difficulty } from "../types";

/**
 * The composer's draft, lifted out of the input component.
 *
 * It lives here so that leaving the composer and coming back does not throw
 * away what the user typed. If this state stayed inside InputPanel it would
 * be destroyed the moment the component unmounted on the screen swap, which
 * makes a "back" button feel like a "discard" button.
 */

export interface ComposerDraft {
  text: string;
  flashcardCount: number;
  quizCount: number;
  difficulty: Difficulty;
  chaos: ChaosMode;
}

const INITIAL_DRAFT: ComposerDraft = {
  text: "",
  flashcardCount: 8,
  quizCount: 5,
  difficulty: "medium",
  chaos: "off",
};

export interface UseComposerDraftResult {
  draft: ComposerDraft;
  update: <K extends keyof ComposerDraft>(key: K, value: ComposerDraft[K]) => void;
  reset: () => void;
}

export function useComposerDraft(): UseComposerDraftResult {
  const [draft, setDraft] = useState<ComposerDraft>(INITIAL_DRAFT);

  const update = useCallback<UseComposerDraftResult["update"]>((key, value) => {
    setDraft((previous) => ({ ...previous, [key]: value }));
  }, []);

  const reset = useCallback(() => setDraft(INITIAL_DRAFT), []);

  return { draft, update, reset };
}
