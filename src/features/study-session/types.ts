import type { z } from "zod";
import type {
  ApiErrorSchema,
  DifficultySchema,
  FlashcardSchema,
  GenerateRequestSchema,
  GenerateResponseSchema,
  GenerationMetaSchema,
  HealthResponseSchema,
  HealthStatusSchema,
  QuizQuestionSchema,
  StudySessionSchema,
} from "./api/schema";

/** Every type in the app is inferred from the schema — never hand-written twice. */
export type Difficulty = z.infer<typeof DifficultySchema>;
export type GenerateRequest = z.infer<typeof GenerateRequestSchema>;
export type GenerateRequestInput = z.input<typeof GenerateRequestSchema>;
export type Flashcard = z.infer<typeof FlashcardSchema>;
export type QuizQuestion = z.infer<typeof QuizQuestionSchema>;
export type StudySession = z.infer<typeof StudySessionSchema>;
export type GenerationMeta = z.infer<typeof GenerationMetaSchema>;
export type ApiError = z.infer<typeof ApiErrorSchema>;
export type GenerateResponse = z.infer<typeof GenerateResponseSchema>;
export type HealthStatus = z.infer<typeof HealthStatusSchema>;
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
