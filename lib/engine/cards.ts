import { createEmptyCard, fsrs, Rating, State, type Card, type Grade } from "ts-fsrs";
import { ENGINE_CONFIG } from "./config.ts";

// The two-card scheduling wrapper (spec: Scheduling). Each student–sense pair has a
// recognition card (understand the Spanish) and, once recognition is stable enough, a
// production card (produce the Spanish from the meaning). A question updates only the card
// it tests.

export type CardKind = "recognition" | "production";

export type SenseMemory = {
  recognition: Card;
  production: Card | null;
  /** Longest gap, in days, before a passed recognition review (for the "learned" rule). */
  bestRecognitionPassDays: number;
};

const DAY_MS = 86_400_000;

export const scheduler = fsrs({
  request_retention: ENGINE_CONFIG.fsrs.requestRetention,
  enable_short_term: ENGINE_CONFIG.fsrs.enableShortTerm,
  enable_fuzz: ENGINE_CONFIG.fsrs.enableFuzz,
  maximum_interval: ENGINE_CONFIG.fsrs.maximumIntervalDays,
});

export function newSenseMemory(now: Date): SenseMemory {
  return { recognition: createEmptyCard(now), production: null, bestRecognitionPassDays: 0 };
}

export function applyReview(
  memory: SenseMemory,
  kind: CardKind,
  rating: Grade,
  now: Date,
  /** Overrides the unlock threshold; the simulator uses Infinity to model one card per sense. */
  productionUnlockStabilityDays: number = ENGINE_CONFIG.productionUnlockStabilityDays,
): { memory: SenseMemory; unlockedProduction: boolean } {
  const card = memory[kind];
  if (!card) throw new Error(`no ${kind} card yet`);

  const gapDays = card.last_review ? (now.getTime() - card.last_review.getTime()) / DAY_MS : 0;
  const next: SenseMemory = { ...memory, [kind]: scheduler.next(card, now, rating).card };

  if (kind === "recognition" && rating !== Rating.Again) {
    next.bestRecognitionPassDays = Math.max(memory.bestRecognitionPassDays, gapDays);
  }

  const unlockedProduction =
    next.production === null && next.recognition.stability >= productionUnlockStabilityDays;
  if (unlockedProduction) next.production = createEmptyCard(now);

  return { memory: next, unlockedProduction };
}

/**
 * "I already know this" followed by a correct production answer: the word is scheduled as
 * known (Easy) on recognition, and the production answer counts for the production card.
 */
export function markKnown(memory: SenseMemory, now: Date): SenseMemory {
  let next = applyReview(memory, "recognition", Rating.Easy, now).memory;
  next.production ??= createEmptyCard(now);
  next = applyReview(next, "production", Rating.Easy, now).memory;
  return next;
}

/** Predicted probability of recall now; 0 for a card that was never reviewed. */
export function recall(card: Card, now: Date): number {
  if (card.state === State.New) return 0;
  return scheduler.get_retrievability(card, now, false);
}

/**
 * Learned (spec: Scheduling): passed a recognition review after a gap of at least 7 days,
 * and current predicted recall is at least 85%.
 */
export function isLearned(memory: SenseMemory, now: Date): boolean {
  return (
    memory.bestRecognitionPassDays >= ENGINE_CONFIG.learnedMinIntervalDays &&
    recall(memory.recognition, now) >= ENGINE_CONFIG.learnedMinRecall
  );
}
