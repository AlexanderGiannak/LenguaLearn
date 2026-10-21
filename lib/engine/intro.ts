import type { QuestionType } from "./questions.ts";
import type { EngineSense } from "./types.ts";

// New word flow (spec: New word flow). The UI shows the word page with "Got it" and
// "I already know this"; these decide what comes next.

/**
 * Guess first: true cognates and words built from parts are shown alone first and asked as
 * a meaning question before the word page. The guess is logged but changes no FSRS card.
 * The spec limits this to parts the student already knows; until per-part knowledge is
 * tracked, any word with a parts breakdown qualifies.
 */
export function guessFirst(sense: EngineSense): boolean {
  return sense.cognate === "true_cognate" || sense.hasWordParts;
}

/**
 * "Got it" leads to an easy recognition question. "I already know this" leads to a
 * production question (typed cloze when there is a sentence); if that is right, the word is
 * scheduled as known (cards.markKnown), and if wrong, it continues as a new word.
 */
export function introQuestionType(
  choice: "got_it" | "already_know",
  sense: EngineSense,
): QuestionType {
  if (choice === "got_it") return "meaning_choice";
  return sense.examples.length > 0 ? "cloze_typed" : "meaning_typed";
}
