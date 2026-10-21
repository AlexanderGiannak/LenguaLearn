import { describe, expect, it } from "vitest";
import { Rating } from "ts-fsrs";
import { applyReview, isLearned, markKnown, newSenseMemory, recall } from "./cards.ts";
import { ENGINE_CONFIG } from "./config.ts";

const DAY = 86_400_000;
const t0 = new Date("2026-10-21T15:00:00Z");
const at = (days: number) => new Date(t0.getTime() + days * DAY);

describe("two cards per sense", () => {
  it("starts with only a recognition card", () => {
    const m = newSenseMemory(t0);
    expect(m.recognition).toBeDefined();
    expect(m.production).toBeNull();
  });

  it("creates the production card once recognition stability reaches the threshold", () => {
    let m = newSenseMemory(t0);
    m = applyReview(m, "recognition", Rating.Good, t0).memory;
    expect(m.recognition.stability).toBeLessThan(ENGINE_CONFIG.productionUnlockStabilityDays);
    expect(m.production).toBeNull();

    const step = applyReview(m, "recognition", Rating.Good, at(2));
    expect(step.memory.recognition.stability).toBeGreaterThanOrEqual(
      ENGINE_CONFIG.productionUnlockStabilityDays,
    );
    expect(step.unlockedProduction).toBe(true);
    expect(step.memory.production).not.toBeNull();
  });

  it("updates only the card the question tests", () => {
    let m = markKnown(newSenseMemory(t0), t0);
    const recognitionBefore = m.recognition;
    m = applyReview(m, "production", Rating.Again, at(1)).memory;
    expect(m.recognition).toEqual(recognitionBefore);
    expect(m.production!.lapses).toBe(1);
  });

  it("refuses a production review before the production card exists", () => {
    expect(() => applyReview(newSenseMemory(t0), "production", Rating.Good, t0)).toThrow();
  });

  it("does not treat repeats within a session as days of evidence", () => {
    let m = newSenseMemory(t0);
    m = applyReview(m, "recognition", Rating.Good, t0).memory;
    const afterFirst = m.recognition.stability;
    for (const minutes of [5, 10, 15]) {
      m = applyReview(
        m,
        "recognition",
        Rating.Good,
        new Date(t0.getTime() + minutes * 60_000),
      ).memory;
    }
    expect(m.recognition.stability).toBeCloseTo(afterFirst, 5);
  });
});

describe("markKnown ('I already know this' answered correctly)", () => {
  it("rates both cards Easy so the word is scheduled as known", () => {
    const m = markKnown(newSenseMemory(t0), t0);
    expect(m.recognition.stability).toBeGreaterThan(5);
    expect(m.production).not.toBeNull();
    expect(m.production!.reps).toBe(1);
  });
});

describe("isLearned", () => {
  it("needs a passed recognition review after a gap of at least 7 days", () => {
    let m = markKnown(newSenseMemory(t0), t0);
    m = applyReview(m, "recognition", Rating.Good, at(6.9)).memory;
    expect(isLearned(m, at(6.9))).toBe(false);
    m = applyReview(m, "recognition", Rating.Good, at(14)).memory;
    expect(isLearned(m, at(14))).toBe(true);
  });

  it("stops counting once predicted recall drops below 85%", () => {
    let m = markKnown(newSenseMemory(t0), t0);
    m = applyReview(m, "recognition", Rating.Good, at(8)).memory;
    expect(isLearned(m, at(8))).toBe(true);
    expect(isLearned(m, at(400))).toBe(false);
  });

  it("does not count a failed review after a long gap", () => {
    let m = markKnown(newSenseMemory(t0), t0);
    m = applyReview(m, "recognition", Rating.Again, at(10)).memory;
    expect(m.bestRecognitionPassDays).toBe(0);
    expect(isLearned(m, at(10))).toBe(false);
  });
});

describe("recall", () => {
  it("is 1 right after a review and falls over time", () => {
    const m = applyReview(newSenseMemory(t0), "recognition", Rating.Good, t0).memory;
    expect(recall(m.recognition, t0)).toBeCloseTo(1, 3);
    expect(recall(m.recognition, at(10))).toBeLessThan(0.9);
  });

  it("is 0 for a card never reviewed", () => {
    expect(recall(newSenseMemory(t0).recognition, at(1))).toBe(0);
  });
});
