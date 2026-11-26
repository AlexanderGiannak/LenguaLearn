import { describe, expect, it } from "vitest";
import { findFlags, STATS_CONFIG, type SenseTypeStats } from "./stats";

// A bank of ordinary senses: 80% right on choice questions, 50% on typed ones, usual speed.
function bank(level = 1, n = 20): SenseTypeStats[] {
  return Array.from({ length: n }, (_, i) => [
    {
      senseId: 1000 + i,
      level,
      questionType: "meaning_choice",
      answers: 40,
      correct: 32,
      medianTimeRatio: 1,
    },
    {
      senseId: 1000 + i,
      level,
      questionType: "cloze_typed",
      answers: 20,
      correct: 10,
      medianTimeRatio: 1,
    },
  ]).flat();
}

describe("findFlags", () => {
  it("flags nothing in an ordinary bank", () => {
    expect(findFlags(bank(), [])).toEqual([]);
  });

  it("flags accuracy far below what the question types predict", () => {
    const bad = [
      {
        senseId: 1,
        level: 1,
        questionType: "meaning_choice",
        answers: 40,
        correct: 16,
        medianTimeRatio: 1,
      },
    ];
    expect(findFlags([...bank(), ...bad], [])).toEqual([
      { senseId: 1, kind: "low_accuracy", detail: { accuracy: 0.4, expected: 0.8, answers: 40 } },
    ]);
  });

  it("does not blame a sense for being asked harder question types", () => {
    // Mostly typed questions: 50% right is what typed questions get.
    const typedHeavy = [
      {
        senseId: 2,
        level: 1,
        questionType: "cloze_typed",
        answers: 40,
        correct: 20,
        medianTimeRatio: 1,
      },
    ];
    expect(findFlags([...bank(), ...typedHeavy], [])).toEqual([]);
  });

  it("waits for enough answers", () => {
    const few = [
      {
        senseId: 3,
        level: 1,
        questionType: "meaning_choice",
        answers: STATS_CONFIG.minAnswers - 1,
        correct: 0,
        medianTimeRatio: 5,
      },
    ];
    expect(findFlags([...bank(), ...few], [])).toEqual([]);
  });

  it("flags answers that take far longer than usual", () => {
    const slow = [
      {
        senseId: 4,
        level: 1,
        questionType: "meaning_choice",
        answers: 40,
        correct: 32,
        medianTimeRatio: 2.6,
      },
    ];
    expect(findFlags([...bank(), ...slow], [])).toEqual([
      { senseId: 4, kind: "slow", detail: { timesUsual: 2.6, answers: 40 } },
    ]);
  });

  it("uses all levels when a level has too few answers for its own baseline", () => {
    const lonely = [
      {
        senseId: 5,
        level: 9,
        questionType: "meaning_choice",
        answers: 40,
        correct: 12,
        medianTimeRatio: 1,
      },
    ];
    expect(findFlags([...bank(), ...lonely], []).map((f) => f.kind)).toEqual(["low_accuracy"]);
  });

  it("flags one wrong option taking over half the wrong picks", () => {
    const picks = [
      { senseId: 6, questionType: "meaning_choice", option: "fixture-a", picks: 8 },
      { senseId: 6, questionType: "meaning_choice", option: "fixture-b", picks: 3 },
      { senseId: 6, questionType: "meaning_choice", option: "fixture-c", picks: 2 },
      // Another type's options are counted separately: no single option dominates here.
      { senseId: 6, questionType: "word_choice", option: "fixture-d", picks: 5 },
      { senseId: 6, questionType: "word_choice", option: "fixture-e", picks: 5 },
      // Too few wrong picks to judge.
      { senseId: 7, questionType: "meaning_choice", option: "fixture-a", picks: 6 },
    ];
    expect(findFlags(bank(), picks)).toEqual([
      {
        senseId: 6,
        kind: "distractor_magnet",
        detail: {
          option: "fixture-a",
          questionType: "meaning_choice",
          share: 0.62,
          wrongPicks: 13,
        },
      },
    ]);
  });
});
