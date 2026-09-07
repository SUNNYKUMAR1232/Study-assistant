import { FlashcardSchema, QuizQuestionSchema, StudySessionSchema } from "./schema";
import type { Flashcard, QuizQuestion, StudySession } from "../types";

/**
 * Everything in this file exists because the model is not trustworthy.
 *
 * It is the ONLY module that knows the payload might be malformed, and it is
 * deliberately forgiving in one direction only: it will drop or repair an
 * individual item, but it will never invent study content the model did not
 * produce, and it will never hand the UI a value the schema rejects.
 */

export type NormalizeResult =
  | { ok: true; data: StudySession; warnings: string[]; degraded: boolean }
  | { ok: false; reason: string };

const FALLBACK_TITLE = "Study session";
const FALLBACK_SUMMARY = "No summary was returned for this material.";

/* ------------------------------------------------------------------ */
/* 1. Get to a JS value at all                                         */
/* ------------------------------------------------------------------ */

/**
 * Models wrap JSON in prose, in code fences, or emit a trailing comma.
 * Try increasingly desperate strategies, then give up rather than guess.
 */
export function extractJson(raw: string): unknown {
  const text = raw.trim();
  if (!text) return undefined;

  const attempts: string[] = [text];

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) attempts.push(fenced[1].trim());

  // Widest object-or-array-looking slice of the response.
  const start = text.search(/[[{]/);
  const end = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
  if (start !== -1 && end > start) attempts.push(text.slice(start, end + 1));

  for (const attempt of attempts) {
    const parsed = tryParse(attempt) ?? tryParse(stripTrailingCommas(attempt));
    if (parsed !== undefined) return parsed;
  }
  return undefined;
}

function tryParse(candidate: string): unknown {
  try {
    return JSON.parse(candidate);
  } catch {
    return undefined;
  }
}

function stripTrailingCommas(input: string): string {
  return input.replace(/,\s*([}\]])/g, "$1");
}

/* ------------------------------------------------------------------ */
/* 2. Coerce the shape                                                 */
/* ------------------------------------------------------------------ */

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return undefined;
}

/** The answer comes back as an index, a 1-based index, a letter, or the text. */
function resolveAnswerIndex(value: unknown, options: string[]): number | undefined {
  if (typeof value === "number" && Number.isInteger(value)) {
    if (value >= 0 && value < options.length) return value;
    if (value === options.length) return value - 1; // 1-based off-by-one
    return undefined;
  }

  const text = asString(value);
  if (!text) return undefined;

  if (/^\d+$/.test(text)) return resolveAnswerIndex(Number(text), options);

  if (text.length === 1) {
    const letter = text.toUpperCase().charCodeAt(0) - 65; // "A" -> 0
    if (letter >= 0 && letter < options.length) return letter;
  }

  const match = options.findIndex((o) => o.toLowerCase() === text.toLowerCase());
  return match === -1 ? undefined : match;
}

function normalizeFlashcard(value: unknown, index: number): Flashcard | null {
  const record = asRecord(value);
  if (!record) return null;

  const parsed = FlashcardSchema.safeParse({
    id: asString(record.id) || `card-${index + 1}`,
    front: asString(record.front) ?? asString(record.question) ?? "",
    back: asString(record.back) ?? asString(record.answer) ?? "",
    hint: asString(record.hint) || undefined,
  });

  return parsed.success ? parsed.data : null;
}

function normalizeQuizQuestion(value: unknown, index: number): QuizQuestion | null {
  const record = asRecord(value);
  if (!record) return null;

  const rawOptions = Array.isArray(record.options) ? record.options : [];
  const options = rawOptions.map(asString).filter((o): o is string => Boolean(o));

  // Four distinct options is part of the contract; three is unrenderable.
  if (options.length !== 4 || new Set(options).size !== 4) return null;

  const answerIndex = resolveAnswerIndex(record.answerIndex ?? record.answer, options);
  if (answerIndex === undefined) return null;

  const parsed = QuizQuestionSchema.safeParse({
    id: asString(record.id) || `q-${index + 1}`,
    question: asString(record.question) ?? asString(record.prompt) ?? "",
    options,
    answerIndex,
    explanation: asString(record.explanation) || "No explanation was provided.",
  });

  return parsed.success ? parsed.data : null;
}

/** Duplicate ids break React keys and quiz scoring, so make them unique here. */
function dedupeIds<T extends { id: string }>(items: T[], prefix: string): T[] {
  const seen = new Set<string>();
  return items.map((item, index) => {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      return item;
    }
    let id = `${prefix}-${index + 1}`;
    while (seen.has(id)) id += "x";
    seen.add(id);
    return { ...item, id };
  });
}

/* ------------------------------------------------------------------ */
/* 3. Public entry point                                               */
/* ------------------------------------------------------------------ */

export function normalizeStudySession(input: unknown): NormalizeResult {
  const value = typeof input === "string" ? extractJson(input) : input;
  const root = asRecord(value);
  if (!root) return { ok: false, reason: "The model did not return a JSON object." };

  const rawFlashcards = Array.isArray(root.flashcards) ? root.flashcards : [];
  const rawQuiz = Array.isArray(root.quiz) ? root.quiz : [];

  const flashcards = dedupeIds(
    rawFlashcards
      .map((item, i) => normalizeFlashcard(item, i))
      .filter((card): card is Flashcard => card !== null),
    "card",
  );
  const quiz = dedupeIds(
    rawQuiz
      .map((item, i) => normalizeQuizQuestion(item, i))
      .filter((question): question is QuizQuestion => question !== null),
    "q",
  );

  const warnings: string[] = [];
  const droppedCards = rawFlashcards.length - flashcards.length;
  const droppedQuestions = rawQuiz.length - quiz.length;
  if (droppedCards > 0) warnings.push(`Skipped ${droppedCards} malformed flashcard(s).`);
  if (droppedQuestions > 0) warnings.push(`Skipped ${droppedQuestions} malformed question(s).`);

  // Partial success is still success: cards with no quiz is a usable session.
  if (flashcards.length === 0 && quiz.length === 0) {
    return { ok: false, reason: "The model returned no usable flashcards or questions." };
  }
  if (quiz.length === 0) warnings.push("No quiz questions survived validation.");

  const session: StudySession = {
    title: asString(root.title) || FALLBACK_TITLE,
    summary: asString(root.summary) || FALLBACK_SUMMARY,
    flashcards: flashcards.length > 0 ? flashcards : [cardFromQuiz(quiz)],
    quiz,
  };

  // StudySessionSchema requires a non-empty quiz. A quiz-less session is a
  // legitimate degraded result, so validate the parts and assemble by hand.
  const validated = StudySessionSchema.omit({ quiz: true }).safeParse(session);
  if (!validated.success) {
    return { ok: false, reason: "The model's response did not match the expected shape." };
  }

  return {
    ok: true,
    data: { ...validated.data, quiz },
    warnings,
    degraded: warnings.length > 0,
  };
}

/** Only reached when the quiz survived but every flashcard was malformed. */
function cardFromQuiz(quiz: QuizQuestion[]): Flashcard {
  const first = quiz[0];
  return {
    id: "card-1",
    front: first?.question ?? "Review this material",
    back: first?.options[first.answerIndex] ?? "See the quiz below.",
  };
}
