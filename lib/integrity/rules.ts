import { INTEGRITY_CONFIG as C } from "./config";

// Flagged time (spec: Integrity, "Flagged time"). Pure rules over a student's recent answers
// in one session; the server applies them after each answer. A flag marks a pattern for the
// teacher to look at. It never accuses, and "I don't know" is never flagged.

export type FlagReason = "fast" | "same_position" | "hidden_tab";

export type RecentAnswer = {
  id: number;
  responseMs: number;
  correct: boolean;
  dontKnow: boolean;
  /** Option position chosen, or null for typed answers. */
  chosenIndex: number | null;
  minReadingMs: number;
  /** Time from returning to a hidden tab to answering, if the tab was hidden mid-question. */
  hiddenReturnMs: number | null;
  flagged: boolean;
};

/** Minimum reading time: 1 s for a short 4-option question, more with more text. */
export function minReadingMs(charsOnScreen: number): number {
  const extra = Math.max(0, charsOnScreen - C.minReadingBaseChars);
  return C.minReadingBaseMs + extra * C.minReadingMsPerChar;
}

/** The answers (oldest first) ending at the current one that all pass `test`. */
function trailingRun(all: RecentAnswer[], test: (x: RecentAnswer) => boolean): RecentAnswer[] {
  const run: RecentAnswer[] = [];
  for (let i = all.length - 1; i >= 0 && test(all[i]!); i--) run.unshift(all[i]!);
  return run;
}

/**
 * Which answers to flag now, given the session's earlier answers (oldest first) and the
 * current one. `notify` is true when this starts a new flagged stretch, so the student sees
 * the gentle note once rather than on every answer.
 */
export function evaluateFlags(
  history: RecentAnswer[],
  current: RecentAnswer,
): { flag: { id: number; reason: FlagReason }[]; notify: boolean } {
  if (current.dontKnow) return { flag: [], notify: false };
  const all = [...history, current];
  const flags = new Map<number, FlagReason>();

  const fast = trailingRun(all, (x) => !x.dontKnow && x.responseMs < x.minReadingMs);
  if (fast.length >= C.fastStreak) {
    const accuracy = fast.filter((x) => x.correct).length / fast.length;
    if (accuracy < C.fastMaxAccuracy) for (const x of fast) flags.set(x.id, "fast");
  }

  if (current.chosenIndex !== null) {
    const same = trailingRun(
      all,
      (x) => !x.dontKnow && !x.correct && x.chosenIndex === current.chosenIndex,
    );
    if (same.length >= C.samePositionStreak) {
      for (const x of same) if (!flags.has(x.id)) flags.set(x.id, "same_position");
    }
  }

  if (current.hiddenReturnMs !== null && current.hiddenReturnMs < C.hiddenReturnMs) {
    if (!flags.has(current.id)) flags.set(current.id, "hidden_tab");
  }

  const byId = new Map(all.map((x) => [x.id, x]));
  const flag = [...flags]
    .filter(([id]) => !byId.get(id)!.flagged)
    .map(([id, reason]) => ({ id, reason }));
  // A new stretch: nothing just before it was flagged already.
  const notify = flag.length > 0 && !history.at(-1)?.flagged;
  return { flag, notify };
}
