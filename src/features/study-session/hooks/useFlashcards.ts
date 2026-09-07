"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Flashcard } from "../types";

/**
 * Deck interaction state: which card, which side, what order.
 * Knows nothing about how the cards were produced.
 */

export interface UseFlashcardsResult {
  cards: Flashcard[];
  current: Flashcard | undefined;
  index: number;
  total: number;
  isFlipped: boolean;
  isShuffled: boolean;
  flip: () => void;
  next: () => void;
  previous: () => void;
  goTo: (index: number) => void;
  toggleShuffle: () => void;
}

export function useFlashcards(cards: Flashcard[]): UseFlashcardsResult {
  const [index, setIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isShuffled, setIsShuffled] = useState(false);
  const [seed, setSeed] = useState(0);

  // A new deck resets position; a re-render with the same deck does not.
  const signature = cards.map((card) => card.id).join("|");
  const previousSignature = useRef(signature);
  useEffect(() => {
    if (previousSignature.current !== signature) {
      previousSignature.current = signature;
      setIndex(0);
      setIsFlipped(false);
      setIsShuffled(false);
    }
  }, [signature]);

  const ordered = useMemo(() => {
    if (!isShuffled) return cards;
    return shuffle(cards, seed);
  }, [cards, isShuffled, seed]);

  const total = ordered.length;

  const goTo = useCallback(
    (next: number) => {
      if (total === 0) return;
      setIsFlipped(false);
      setIndex(((next % total) + total) % total); // wrap in both directions
    },
    [total],
  );

  const next = useCallback(() => goTo(index + 1), [goTo, index]);
  const previous = useCallback(() => goTo(index - 1), [goTo, index]);
  const flip = useCallback(() => setIsFlipped((value) => !value), []);

  const toggleShuffle = useCallback(() => {
    setIsShuffled((value) => {
      if (!value) setSeed(Date.now());
      return !value;
    });
    setIndex(0);
    setIsFlipped(false);
  }, []);

  return {
    cards: ordered,
    current: ordered[index],
    index,
    total,
    isFlipped,
    isShuffled,
    flip,
    next,
    previous,
    goTo,
    toggleShuffle,
  };
}

/** Seeded Fisher-Yates, so the order is stable across re-renders. */
function shuffle<T>(items: T[], seed: number): T[] {
  const result = [...items];
  let state = seed || 1;
  for (let i = result.length - 1; i > 0; i--) {
    state = (state * 1664525 + 1013904223) % 4294967296;
    const j = state % (i + 1);
    const a = result[i];
    const b = result[j];
    if (a !== undefined && b !== undefined) {
      result[i] = b;
      result[j] = a;
    }
  }
  return result;
}
