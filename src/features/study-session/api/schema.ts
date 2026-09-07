import { z } from "zod";

/**
 * The single source of truth for the client <-> server contract.
 *
 * This module is imported by BOTH the route handler and the browser hook,
 * and it is also converted to a JSON Schema and handed to the model as a
 * tool definition. One file therefore defines: what the model is asked to
 * produce, what the server accepts, and what the UI can rely on.
 */

export const DIFFICULTIES = ["easy", "medium", "hard"] as const;
export const DifficultySchema = z.enum(DIFFICULTIES);

/* ------------------------------------------------------------------ */
/* Request                                                             */
/* ------------------------------------------------------------------ */

export const MIN_INPUT_CHARS = 40;
export const MAX_INPUT_CHARS = 12_000;

export const GenerateRequestSchema = z.object({
  text: z
    .string()
    .trim()
    .min(MIN_INPUT_CHARS, `Give me at least ${MIN_INPUT_CHARS} characters to work with.`)
    .max(MAX_INPUT_CHARS, `That is longer than ${MAX_INPUT_CHARS} characters. Trim it down.`),
  flashcardCount: z.number().int().min(3).max(20).default(8),
  quizCount: z.number().int().min(3).max(15).default(5),
  difficulty: DifficultySchema.default("medium"),
});

/* ------------------------------------------------------------------ */
/* Model output — this shape is what the tool definition advertises     */
/* ------------------------------------------------------------------ */

export const FlashcardSchema = z.object({
  id: z.string().min(1),
  front: z.string().min(1).max(300),
  back: z.string().min(1).max(800),
  hint: z.string().max(200).optional(),
});

export const QuizQuestionSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1).max(400),
  options: z.array(z.string().min(1).max(240)).length(4),
  answerIndex: z.number().int().min(0).max(3),
  explanation: z.string().min(1).max(600),
});

export const StudySessionSchema = z.object({
  title: z.string().min(1).max(120),
  summary: z.string().min(1).max(1200),
  flashcards: z.array(FlashcardSchema).min(1),
  quiz: z.array(QuizQuestionSchema).min(1),
});

/* ------------------------------------------------------------------ */
/* Envelope                                                            */
/* ------------------------------------------------------------------ */

export const GenerationMetaSchema = z.object({
  model: z.string(),
  elapsedMs: z.number(),
  /** True when some items were dropped or repaired during normalisation. */
  degraded: z.boolean(),
  warnings: z.array(z.string()),
});

export const ApiErrorSchema = z.object({
  code: z.enum([
    "bad_request",
    "rate_limited",
    "upstream_error",
    "unparseable",
    "timeout",
    "server_error",
  ]),
  message: z.string(),
});

export const GenerateResponseSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), data: StudySessionSchema, meta: GenerationMetaSchema }),
  z.object({ ok: z.literal(false), error: ApiErrorSchema }),
]);
