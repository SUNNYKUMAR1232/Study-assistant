"use client";

import { cn } from "@/shared/lib/cn";
import type { Flashcard as FlashcardModel } from "../types";

/**
 * Dumb by design: it receives a card and a flipped flag, and emits onFlip.
 * It holds no state, so the deck can shuffle or jump without fighting it.
 */
export interface FlashcardProps {
  card: FlashcardModel;
  isFlipped: boolean;
  onFlip: () => void;
}

export function Flashcard({ card, isFlipped, onFlip }: FlashcardProps) {
  return (
    <button
      type="button"
      onClick={onFlip}
      aria-pressed={isFlipped}
      aria-label={isFlipped ? "Showing answer. Activate to show question." : "Showing question. Activate to reveal answer."}
      className={cn(
        "group relative block min-h-56 w-full [perspective:1200px] sm:min-h-64",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 rounded-xl",
        "dark:focus-visible:ring-offset-slate-950",
      )}
    >
      <div
        className={cn(
          "relative h-full min-h-56 w-full transition-transform duration-500 [transform-style:preserve-3d] sm:min-h-64",
          "motion-reduce:transition-none",
          isFlipped && "[transform:rotateY(180deg)]",
        )}
      >
        <Face className="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <Label>Question</Label>
          <p className="text-balance text-lg font-medium text-slate-900 sm:text-xl dark:text-slate-100">
            {card.front}
          </p>
          {card.hint ? (
            <p className="mt-3 text-sm italic text-slate-500 dark:text-slate-400">Hint: {card.hint}</p>
          ) : null}
          <Footer>Tap or press Space to flip</Footer>
        </Face>

        <Face
          className={cn(
            "[transform:rotateY(180deg)]",
            "border-indigo-200 bg-indigo-50 dark:border-indigo-900/60 dark:bg-indigo-950/50",
          )}
        >
          <Label>Answer</Label>
          <p className="text-balance text-base leading-relaxed text-slate-900 sm:text-lg dark:text-slate-100">
            {card.back}
          </p>
          <Footer>Tap to flip back</Footer>
        </Face>
      </div>
    </button>
  );
}

function Face({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "absolute inset-0 flex flex-col items-center justify-center rounded-xl border p-5 text-center shadow-sm",
        "[backface-visibility:hidden] [-webkit-backface-visibility:hidden]",
        className,
      )}
    >
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
      {children}
    </span>
  );
}

function Footer({ children }: { children: React.ReactNode }) {
  return (
    <span className="absolute inset-x-0 bottom-3 text-xs text-slate-400 opacity-0 transition-opacity group-hover:opacity-100 dark:text-slate-500">
      {children}
    </span>
  );
}
