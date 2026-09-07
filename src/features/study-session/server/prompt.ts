import { zodToJsonSchema } from "zod-to-json-schema";
import { StudySessionSchema } from "../api/schema";
import type { Difficulty } from "../types";

/**
 * The tool definition handed to the model.
 *
 * We do not ask for JSON in prose and hope. The Zod schema is converted to a
 * JSON Schema and passed as a tool; the model is then forced to call that tool,
 * so the provider constrains generation to the shape we already validate
 * against. schema.ts stays the only source of truth.
 */
export const SAVE_SESSION_TOOL = {
  type: "function" as const,
  function: {
    name: "save_study_session",
    description:
      "Save the flashcards and quiz generated from the user's study material. " +
      "Call this exactly once with the complete set.",
    parameters: zodToJsonSchema(StudySessionSchema, {
      target: "openApi3",
      $refStrategy: "none",
    }) as Record<string, unknown>,
  },
};

const DIFFICULTY_GUIDANCE: Record<Difficulty, string> = {
  easy: "Test recall of definitions and named facts. Keep wording plain.",
  medium: "Mix recall with understanding: ask why something happens, not only what it is.",
  hard: "Favour application and comparison. Distractors should be plausible to someone who half-learned the material.",
};

export function buildSystemPrompt(): string {
  return [
    "You turn study material into flashcards and a multiple-choice quiz.",
    "",
    "Rules:",
    "- Use ONLY facts present in the supplied material. Never add outside knowledge.",
    "- If the material is too thin for the requested count, return fewer items rather than padding.",
    "- Each flashcard front is one question or term; the back is a self-contained answer.",
    "- Every quiz question has exactly four distinct options, one unambiguously correct.",
    "- answerIndex is the zero-based position of the correct option.",
    "- Distractors must be wrong, not merely less right.",
    "- Give every item a short unique id.",
    "- Report your result by calling the save_study_session tool. Write no prose.",
  ].join("\n");
}

export function buildUserPrompt(params: {
  text: string;
  flashcardCount: number;
  quizCount: number;
  difficulty: Difficulty;
}): string {
  const { text, flashcardCount, quizCount, difficulty } = params;
  return [
    `Produce ${flashcardCount} flashcards and ${quizCount} quiz questions.`,
    `Difficulty: ${difficulty}. ${DIFFICULTY_GUIDANCE[difficulty]}`,
    "Also give the session a short title and a two-to-three sentence summary.",
    "",
    "STUDY MATERIAL",
    "---",
    text,
    "---",
  ].join("\n");
}
