import { describe, expect, it } from "vitest";
import {
  abilityForLevel,
  estimateVocabularySize,
  itemDifficulty,
  predictCorrect,
  updateAbility,
} from "./ability.ts";
import { ENGINE_CONFIG } from "./config.ts";

describe("itemDifficulty", () => {
  it("uses measured difficulty once fitted", () => {
    expect(itemDifficulty({ difficulty: 4.2, frequencyRank: 100 })).toBe(4.2);
  });
  it("falls back to log frequency rank, so rarer words are harder", () => {
    expect(itemDifficulty({ difficulty: null, frequencyRank: 1000 })).toBeGreaterThan(
      itemDifficulty({ difficulty: null, frequencyRank: 100 }),
    );
  });
});

describe("predictCorrect", () => {
  it("is 50% for a typed answer when ability equals difficulty", () => {
    expect(predictCorrect(5, 5, "typed")).toBeCloseTo(0.5);
  });
  it("adds the guessing floor for multiple choice", () => {
    expect(predictCorrect(5, 5, "choice")).toBeCloseTo(0.25 + 0.75 * 0.5);
    expect(predictCorrect(-100, 5, "choice")).toBeCloseTo(ENGINE_CONFIG.ability.choiceGuessRate);
  });
  it("rises with ability", () => {
    expect(predictCorrect(6, 5, "typed")).toBeGreaterThan(predictCorrect(5, 5, "typed"));
  });
});

describe("updateAbility", () => {
  const start = { ability: 5, answers: 0 };

  it("moves up after a correct answer and down after a wrong one", () => {
    expect(updateAbility(start, 5, "typed", true).state.ability).toBeGreaterThan(5);
    expect(updateAbility(start, 5, "typed", false).state.ability).toBeLessThan(5);
  });

  it("moves more after a surprise", () => {
    const easyItemWrong = updateAbility(start, 2, "typed", false).state.ability;
    const hardItemWrong = updateAbility(start, 8, "typed", false).state.ability;
    expect(5 - easyItemWrong).toBeGreaterThan(5 - hardItemWrong);
  });

  it("moves the item's difficulty the other way", () => {
    const r = updateAbility(start, 5, "typed", true);
    expect(r.difficultyDelta).toBeLessThan(0);
  });

  it("takes smaller steps as answers accumulate", () => {
    const early = updateAbility({ ability: 5, answers: 0 }, 5, "typed", true).state.ability - 5;
    const late = updateAbility({ ability: 5, answers: 1000 }, 5, "typed", true).state.ability - 5;
    expect(late).toBeLessThan(early);
    expect(late).toBeGreaterThan(0);
  });
});

describe("abilityForLevel", () => {
  it("increases with the starting level and has no maximum", () => {
    expect(abilityForLevel(2)).toBeGreaterThan(abilityForLevel(1));
    expect(Number.isFinite(abilityForLevel(40))).toBe(true);
  });
});

describe("estimateVocabularySize", () => {
  it("is rounded to the nearest 10", () => {
    expect(estimateVocabularySize({ ability: 6, studied: [] }) % 10).toBe(0);
  });

  it("grows with ability", () => {
    expect(estimateVocabularySize({ ability: 7, studied: [] })).toBeGreaterThan(
      estimateVocabularySize({ ability: 5, studied: [] }),
    );
  });

  it("counts studied words by their predicted recall instead of the ability guess", () => {
    const ability = ENGINE_CONFIG.ability.beginnerAbility;
    const studied = Array.from({ length: 200 }, (_, i) => ({ rank: 5000 + i, recall: 1 }));
    const base = estimateVocabularySize({ ability, studied: [] });
    const withStudied = estimateVocabularySize({ ability, studied });
    expect(withStudied - base).toBeGreaterThanOrEqual(190);
    expect(withStudied - base).toBeLessThanOrEqual(210);
  });

  it("does not double count studied words", () => {
    // Very high ability: every word is already assumed known, so recall 0 lowers the total.
    const studied = Array.from({ length: 100 }, (_, i) => ({ rank: i + 1, recall: 0 }));
    expect(estimateVocabularySize({ ability: 20, studied })).toBe(
      ENGINE_CONFIG.ability.vocabularyMaxRank - 100,
    );
  });
});
