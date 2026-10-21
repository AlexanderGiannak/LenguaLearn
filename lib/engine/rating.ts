import { Rating, type Grade } from "ts-fsrs";
import { ENGINE_CONFIG } from "./config.ts";

// Maps a graded answer to an FSRS rating (spec: Scheduling, rating table).

export type AnswerMode = "choice" | "typed";

export type GradedAnswer = {
  /** "hard" is a right answer with a slip: accent, article, typo or verb form. */
  outcome: "correct" | "hard" | "wrong" | "dont_know";
  mode: AnswerMode;
  responseMs: number;
  usedHint: boolean;
  /** From responseThresholds() over this student's past times for the question type. */
  thresholds: { slowMs: number; fastMs: number };
};

export function rateAnswer(a: GradedAnswer): Grade {
  if (a.outcome === "wrong" || a.outcome === "dont_know") return Rating.Again;
  if (a.outcome === "hard" || a.usedHint || a.responseMs > a.thresholds.slowMs) return Rating.Hard;
  // A 4-option guess is right a quarter of the time, so multiple choice never earns Easy.
  if (a.mode === "typed" && a.responseMs < a.thresholds.fastMs) return Rating.Easy;
  return Rating.Good;
}

function percentile(sorted: number[], p: number): number {
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (i - lo);
}

/** Slow and fast cut-offs from the student's own past response times for one question type. */
export function responseThresholds(
  pastMs: readonly number[],
  mode: AnswerMode,
): { slowMs: number; fastMs: number } {
  const c = ENGINE_CONFIG.rating;
  if (pastMs.length < c.minSamplesForPercentile) {
    return { slowMs: c.defaultSlowMs[mode], fastMs: c.defaultFastMs[mode] };
  }
  const sorted = [...pastMs].sort((a, b) => a - b);
  return {
    slowMs: percentile(sorted, c.slowPercentile),
    fastMs: percentile(sorted, c.fastPercentile),
  };
}
