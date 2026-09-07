"use client";

import { useEffect } from "react";
import { Button } from "@/shared/ui/Button";
import { ProgressBar } from "@/shared/ui/ProgressBar";
import { EmptyState } from "@/shared/ui/states";
import { useFlashcards } from "../hooks/useFlashcards";
import { Flashcard } from "./Flashcard";
import type { Flashcard as FlashcardModel } from "../types";

export interface FlashcardDeckProps {
  cards: FlashcardModel[];
  /** Keyboard shortcuts only bind while this panel is the visible one. */
  isActive: boolean;
}

export function FlashcardDeck({ cards, isActive }: FlashcardDeckProps) {
  const deck = useFlashcards(cards);
  const { flip, next, previous } = deck;

  useEffect(() => {
    if (!isActive) return;

    function onKeyDown(event: KeyboardEvent) {
      // Never hijack keys while the user is typing somewhere.
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

      if (event.key === "ArrowRight") {
        event.preventDefault();
        next();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        previous();
      } else if (event.key === " " || event.key === "Enter") {
        // The card itself is a button; let it handle its own activation.
        if (target?.tagName === "BUTTON") return;
        event.preventDefault();
        flip();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isActive, flip, next, previous]);

  if (deck.total === 0 || !deck.current) {
    return (
      <EmptyState
        icon="🗂️"
        title="No flashcards in this session"
        description="The model did not return any usable cards. Try generating again, or paste richer material."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-slate-600 tabular-nums dark:text-slate-400">
          Card {deck.index + 1} of {deck.total}
        </p>
        <Button
          size="sm"
          variant={deck.isShuffled ? "primary" : "ghost"}
          onClick={deck.toggleShuffle}
          aria-pressed={deck.isShuffled}
        >
          Shuffle
        </Button>
      </div>

      <ProgressBar value={deck.index + 1} max={deck.total} label="Flashcard progress" />

      <Flashcard card={deck.current} isFlipped={deck.isFlipped} onFlip={deck.flip} />

      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={deck.previous}>
          Previous
        </Button>
        <Button variant="secondary" className="flex-1" onClick={deck.flip}>
          Flip
        </Button>
        <Button variant="secondary" className="flex-1" onClick={deck.next}>
          Next
        </Button>
      </div>

      <p className="text-center text-xs text-slate-400 dark:text-slate-500">
        Arrow keys navigate · Space flips
      </p>
    </div>
  );
}
