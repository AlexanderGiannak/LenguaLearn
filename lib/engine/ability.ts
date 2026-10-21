import { ENGINE_CONFIG } from "./config.ts";
import type { AnswerMode } from "./rating.ts";

// Ability score and vocabulary-size estimate (spec: Level score).
//
// Ability and item difficulty share one scale: the natural log of a frequency rank. An
// ability of ln(2000) means "about a 50% chance of knowing the word ranked 2,000". Until an
// item's difficulty is fitted from real answers, its difficulty is ln(rank). That shared
// scale is what lets one number seed placement and estimate vocabulary size.

export type AbilityState = { ability: number; answers: number };

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

export function itemDifficulty(item: { difficulty: number | null; frequencyRank: number }) {
  return item.difficulty ?? Math.log(item.frequencyRank);
}

export function predictCorrect(ability: number, difficulty: number, mode: AnswerMode): number {
  const { slope, choiceGuessRate } = ENGINE_CONFIG.ability;
  const know = sigmoid(slope * (ability - difficulty));
  return mode === "choice" ? choiceGuessRate + (1 - choiceGuessRate) * know : know;
}

/**
 * Elo-style update after a graded answer: the further the result is from the prediction,
 * the more the ability moves. The item's difficulty moves the opposite way; the nightly
 * job (later phases) applies those deltas when fitting measured difficulty.
 */
export function updateAbility(
  state: AbilityState,
  difficulty: number,
  mode: AnswerMode,
  correct: boolean,
): { state: AbilityState; expected: number; difficultyDelta: number } {
  const { kStart, kMin, kHalfLifeAnswers } = ENGINE_CONFIG.ability;
  const expected = predictCorrect(state.ability, difficulty, mode);
  const surprise = (correct ? 1 : 0) - expected;
  const k = Math.max(kMin, kStart * 0.5 ** (state.answers / kHalfLifeAnswers));
  return {
    state: { ability: state.ability + k * surprise, answers: state.answers + 1 },
    expected,
    difficultyDelta: -k * surprise,
  };
}

/** Starting ability for a placement level: the middle of that level's frequency band. */
export function abilityForLevel(level: number): number {
  return Math.log((level - 0.5) * ENGINE_CONFIG.levelBandSize);
}

/**
 * "You know about 2,340 Spanish words": predicted recall summed over studied senses, plus
 * the ability model's guess for every unstudied rank up to the bank size.
 */
export function estimateVocabularySize(args: {
  ability: number;
  studied: readonly { rank: number; recall: number }[];
}): number {
  const { slope, vocabularyMaxRank } = ENGINE_CONFIG.ability;
  const studiedRanks = new Set(args.studied.map((s) => s.rank));
  let total = 0;
  for (let rank = 1; rank <= vocabularyMaxRank; rank++) {
    if (!studiedRanks.has(rank)) total += sigmoid(slope * (args.ability - Math.log(rank)));
  }
  for (const s of args.studied) total += s.recall;
  return Math.round(total / 10) * 10;
}
