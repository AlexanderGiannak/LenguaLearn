import { describe, expect, it } from "vitest";
import { Rating } from "ts-fsrs";
import { ENGINE_CONFIG } from "./config.ts";
import { rateAnswer, responseThresholds, type GradedAnswer } from "./rating.ts";

const thresholds = { slowMs: 8000, fastMs: 3000 };
const answer = (over: Partial<GradedAnswer>): GradedAnswer => ({
  outcome: "correct",
  mode: "choice",
  responseMs: 5000,
  usedHint: false,
  thresholds,
  ...over,
});

describe("rateAnswer", () => {
  it.each<[string, Partial<GradedAnswer>, Rating]>([
    ["wrong", { outcome: "wrong" }, Rating.Again],
    ["I don't know", { outcome: "dont_know", responseMs: 500 }, Rating.Again],
    ["correct multiple choice", {}, Rating.Good],
    ["fast multiple choice is never Easy", { responseMs: 1000 }, Rating.Good],
    ["slow multiple choice", { responseMs: 9000 }, Rating.Hard],
    ["correct typed", { mode: "typed" }, Rating.Good],
    ["fast typed", { mode: "typed", responseMs: 2000 }, Rating.Easy],
    ["slow typed", { mode: "typed", responseMs: 9000 }, Rating.Hard],
    ["needed the hint", { mode: "typed", responseMs: 2000, usedHint: true }, Rating.Hard],
    [
      "accent, article, typo or form slip",
      { mode: "typed", outcome: "hard", responseMs: 2000 },
      Rating.Hard,
    ],
    ["exactly at the slow threshold is not slow", { responseMs: 8000 }, Rating.Good],
  ])("%s", (_label, over, expected) => {
    expect(rateAnswer(answer(over))).toBe(expected);
  });
});

describe("responseThresholds", () => {
  it("uses the defaults until there are enough past answers", () => {
    expect(responseThresholds([1000, 2000], "typed")).toEqual({
      slowMs: ENGINE_CONFIG.rating.defaultSlowMs.typed,
      fastMs: ENGINE_CONFIG.rating.defaultFastMs.typed,
    });
  });

  it("uses the student's own 80th and 50th percentiles", () => {
    const past = Array.from({ length: 100 }, (_, i) => (i + 1) * 100); // 100..10000 ms
    const { slowMs, fastMs } = responseThresholds(past, "choice");
    expect(slowMs).toBe(8020);
    expect(fastMs).toBe(5050);
  });
});
