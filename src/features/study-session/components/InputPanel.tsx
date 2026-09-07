"use client";

import { useId, useState } from "react";
import { Button } from "@/shared/ui/Button";
import { Card, CardBody } from "@/shared/ui/Card";
import { cn } from "@/shared/lib/cn";
import {
  DIFFICULTIES,
  MAX_INPUT_CHARS,
  MIN_INPUT_CHARS,
} from "../api/schema";
import { CHAOS_MODES, type ChaosMode } from "../api/chaos";
import type { Difficulty, GenerateRequestInput } from "../types";

const SAMPLE = `Photosynthesis converts light energy into chemical energy stored in glucose. It happens in two stages. The light-dependent reactions occur in the thylakoid membranes, splitting water to release oxygen and producing ATP and NADPH. The Calvin cycle occurs in the stroma and uses that ATP and NADPH to fix carbon dioxide into glucose via the enzyme RuBisCO. The overall equation is 6CO2 + 6H2O + light -> C6H12O6 + 6O2.`;

export interface InputPanelProps {
  isLoading: boolean;
  showChaosControls: boolean;
  onGenerate: (request: GenerateRequestInput, chaos: ChaosMode) => void;
  onCancel: () => void;
}

export function InputPanel({ isLoading, showChaosControls, onGenerate, onCancel }: InputPanelProps) {
  const [text, setText] = useState("");
  const [flashcardCount, setFlashcardCount] = useState(8);
  const [quizCount, setQuizCount] = useState(5);
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [chaos, setChaos] = useState<ChaosMode>("off");

  const textareaId = useId();
  const trimmed = text.trim();
  const tooShort = trimmed.length > 0 && trimmed.length < MIN_INPUT_CHARS;
  const tooLong = trimmed.length > MAX_INPUT_CHARS;
  const canSubmit = trimmed.length >= MIN_INPUT_CHARS && !tooLong;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    onGenerate({ text: trimmed, flashcardCount, quizCount, difficulty }, chaos);
  }

  return (
    <Card>
      <CardBody>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <label htmlFor={textareaId} className="text-sm font-medium text-slate-900 dark:text-slate-100">
                Your study material
              </label>
              <button
                type="button"
                onClick={() => setText(SAMPLE)}
                className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
              >
                Use sample text
              </button>
            </div>

            <textarea
              id={textareaId}
              value={text}
              onChange={(event) => setText(event.target.value)}
              // Ctrl/Cmd+Enter submits — the expected shortcut in a textarea.
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") handleSubmit(event);
              }}
              rows={8}
              placeholder="Paste notes, a textbook passage, an article…"
              aria-describedby={`${textareaId}-help`}
              aria-invalid={tooShort || tooLong || undefined}
              className={cn(
                "mt-2 w-full resize-y rounded-lg border bg-white px-3 py-2 text-base leading-relaxed",
                "placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500",
                "dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-600",
                tooShort || tooLong
                  ? "border-rose-400 dark:border-rose-700"
                  : "border-slate-300 dark:border-slate-700",
              )}
            />

            <p
              id={`${textareaId}-help`}
              className={cn(
                "mt-1.5 text-xs",
                tooLong ? "text-rose-600 dark:text-rose-400" : "text-slate-500 dark:text-slate-400",
              )}
            >
              {tooLong
                ? `${trimmed.length.toLocaleString()} / ${MAX_INPUT_CHARS.toLocaleString()} characters — too long.`
                : tooShort
                  ? `${MIN_INPUT_CHARS - trimmed.length} more characters needed.`
                  : `${trimmed.length.toLocaleString()} / ${MAX_INPUT_CHARS.toLocaleString()} characters`}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <NumberField label="Flashcards" value={flashcardCount} min={3} max={20} onChange={setFlashcardCount} />
            <NumberField label="Questions" value={quizCount} min={3} max={15} onChange={setQuizCount} />
            <SelectField
              label="Difficulty"
              value={difficulty}
              options={DIFFICULTIES}
              onChange={(value) => setDifficulty(value as Difficulty)}
            />
          </div>

          {showChaosControls ? (
            <SelectField
              label="Chaos mode (dev only)"
              value={chaos}
              options={CHAOS_MODES}
              onChange={(value) => setChaos(value as ChaosMode)}
              hint="Force a specific model failure to see how the UI recovers."
            />
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="submit" isLoading={isLoading} disabled={!canSubmit} className="w-full sm:w-auto">
              {isLoading ? "Generating…" : "Generate study session"}
            </Button>
            {isLoading ? (
              <Button type="button" variant="secondary" onClick={onCancel} className="w-full sm:w-auto">
                Cancel
              </Button>
            ) : null}
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium text-slate-900 dark:text-slate-100">
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, Math.round(next))));
        }}
        className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
  hint?: string;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium text-slate-900 dark:text-slate-100">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base capitalize focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option.replace(/-/g, " ")}
          </option>
        ))}
      </select>
      {hint ? <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{hint}</p> : null}
    </div>
  );
}
