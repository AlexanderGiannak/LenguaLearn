import { createEmptyCard, forgetting_curve, Rating, type Card } from "ts-fsrs";
import { scheduler } from "@/lib/engine/cards";
import { ENGINE_CONFIG } from "@/lib/engine/config";
import {
  estimatePlacement,
  newPlacement,
  nextPlacementItem,
  recordPlacementAnswer,
} from "@/lib/engine/placement";
import { seededRng } from "@/lib/engine/types";

// Data for the graphs on the public pages, computed by the real engine (scheduler, placement)
// rather than drawn by hand, so the pictures stay true if the engine's settings change.
// Nothing here touches a database or any learner's data.

const DAY_MS = 86_400_000;

export type RecallPoint = { day: number; recall: number };

/**
 * One word, answered right at every review the scheduler sets, against the same word never
 * reviewed after the first day. Recall is the scheduler's own prediction.
 */
export function reviewCurves(days = 60, step = 0.25) {
  const start = new Date("2026-01-05T15:00:00Z");
  const at = (day: number) => new Date(start.getTime() + day * DAY_MS);
  const states: { from: number; card: Card }[] = [];
  const run = (from: number) => {
    const out: { from: number; card: Card }[] = [];
    let card = createEmptyCard(at(from));
    let t = from;
    while (t <= days) {
      card = scheduler.next(card, at(t), Rating.Good).card;
      out.push({ from: t, card });
      const due = (card.due.getTime() - start.getTime()) / DAY_MS;
      // Same-day steps happen minutes later; a later review happens on its due day.
      t = due - t < 0.5 ? due : Math.round(due);
    }
    return out;
  };
  // Same-day steps (the first day's quick re-checks) are one review day on the chart.
  const reviewDaysOf = (s: { from: number }[]) =>
    [...new Set(s.map((x) => Math.round(x.from * 4) / 4))].filter((d) => d <= days);
  states.push(...run(0));
  // The production card starts at the review where recognition becomes stable enough.
  const unlock = states.find(
    (s) => s.card.stability >= ENGINE_CONFIG.productionUnlockStabilityDays,
  )!.from;
  const firstDay = states.filter((s) => s.from < 1).at(-1)!.card;
  // The scheduler's own forgetting curve, at fractional days: its retrievability helper
  // counts whole days, which would draw a staircase.
  const recall = (c: Card, d: number) =>
    forgetting_curve(
      scheduler.parameters.w,
      Math.max(0, (at(d).getTime() - c.last_review!.getTime()) / DAY_MS),
      c.stability,
    );
  const withReviews: RecallPoint[] = [];
  const withoutReviews: RecallPoint[] = [];
  for (let d = 0; d <= days + 1e-9; d += step) {
    const now = states.filter((s) => s.from <= d + 1e-9).at(-1)!.card;
    withReviews.push({ day: d, recall: recall(now, d) });
    withoutReviews.push({ day: d, recall: recall(firstDay, d) });
  }
  return {
    reviewDays: reviewDaysOf(states),
    productionFromDay: unlock,
    productionReviewDays: reviewDaysOf(run(unlock)),
    withReviews,
    withoutReviews,
  };
}

export type PlacementStep = {
  n: number;
  kind: "word" | "pseudo";
  /** Frequency rank of a real word. */
  rank: number | null;
  yes: boolean;
  /** Where the learner knows about half the words, once the estimate can be trusted. */
  estimateRank: number | null;
};

/**
 * A synthetic learner taking the real placement test: they know about half the words at
 * `trueRank`, and almost never claim a made-up word.
 */
export function placementTrace(trueRank = 2_000, seed = 7) {
  const rng = seededRng(seed);
  const answerRng = seededRng(seed + 1);
  const words = Array.from({ length: 400 }, (_, i) => ({
    id: i,
    rank: Math.round(Math.exp(Math.log(5) + (i / 399) * Math.log(10_000 / 5))),
  }));
  const pseudowords = Array.from({ length: 30 }, (_, i) => ({ id: 1_000 + i }));
  const slope = ENGINE_CONFIG.placement.slope;
  let state = newPlacement();
  const steps: PlacementStep[] = [];
  for (
    let item = nextPlacementItem(state, { words, pseudowords }, rng);
    item;
    item = nextPlacementItem(state, { words, pseudowords }, rng)
  ) {
    const pYes =
      item.kind === "word"
        ? 1 / (1 + Math.exp(-slope * (Math.log(trueRank) - Math.log(item.rank))))
        : 0.05;
    const yes = answerRng() < pYes;
    state = recordPlacementAnswer(state, item, yes);
    const est = estimatePlacement(state);
    steps.push({
      n: steps.length + 1,
      kind: item.kind,
      rank: item.kind === "word" ? item.rank : null,
      yes,
      estimateRank: est.reliable ? Math.round(Math.exp(est.ability)) : null,
    });
  }
  return { steps, trueRank, level: estimatePlacement(state).level };
}

/**
 * Share of running text made of the words up to each level, under Zipf's law (a word's
 * frequency is inversely proportional to its rank) over a vocabulary of `vocabulary` words.
 * A model, not a corpus count: the pages say so.
 */
export function zipfCoverage(levels = 10, vocabulary = 50_000) {
  const band = ENGINE_CONFIG.levelBandSize;
  const harmonic = (n: number) => Math.log(n) + 0.5772156649 + 1 / (2 * n);
  return Array.from({ length: levels }, (_, i) => ({
    level: i + 1,
    share: harmonic((i + 1) * band) / harmonic(vocabulary),
  }));
}
