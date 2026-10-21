import { State } from "ts-fsrs";
import { recall, type CardKind, type SenseMemory } from "./cards.ts";
import { ENGINE_CONFIG } from "./config.ts";
import { randomInt, type Rng } from "./types.ts";

// Chooses the next item one at a time (spec: Session), in this order:
//   1. an item missed this session that is due to come back (3–5 items after the miss)
//   2. a new word's second check (4–6 items after its intro)
//   3. the due review with the lowest predicted recall
//   4. a new word, if the new-word gate is open
//   5. otherwise the review closest to its due date, so the student is never idle

export type NextItem =
  | { kind: "missed" | "review" | "early_review"; senseId: number; card: CardKind }
  | { kind: "second_check"; senseId: number; card: "recognition" }
  | { kind: "new"; senseId: number }
  | null;

type Pending = { senseId: number; card: CardKind; atItem: number };

export type SessionState = {
  /** Questions answered so far this session. */
  itemsShown: number;
  newIntroduced: number;
  pendingMisses: Pending[];
  pendingSecondChecks: { senseId: number; atItem: number }[];
  lastSenseId: number | null;
};

export function newSession(): SessionState {
  return {
    itemsShown: 0,
    newIntroduced: 0,
    pendingMisses: [],
    pendingSecondChecks: [],
    lastSenseId: null,
  };
}

export function isGateOpen(args: {
  /** Correctness of the student's answers, oldest first (across sessions). */
  recentCorrect: readonly boolean[];
  overdue: number;
  newThisSession: number;
}): boolean {
  const g = ENGINE_CONFIG.newWordGate;
  const recent = args.recentCorrect.slice(-g.recentAnswers);
  const accuracy = recent.length ? recent.filter(Boolean).length / recent.length : 1;
  return (
    accuracy >= g.minRecentAccuracy &&
    args.overdue < g.maxOverdue &&
    args.newThisSession < g.maxNewPerSession
  );
}

type CardEntry = { senseId: number; card: CardKind; due: number; recall: number };

function studiedCards(memories: ReadonlyMap<number, SenseMemory>, now: Date): CardEntry[] {
  const out: CardEntry[] = [];
  for (const [senseId, m] of memories) {
    for (const card of ["recognition", "production"] as const) {
      const c = m[card];
      // A production card that exists but was never asked counts as due right away.
      if (!c || (c.state === State.New && card === "recognition")) continue;
      out.push({ senseId, card, due: c.due.getTime(), recall: recall(c, now) });
    }
  }
  return out;
}

/** Reviews due now, counting each card separately. */
export function countOverdue(memories: ReadonlyMap<number, SenseMemory>, now: Date): number {
  return studiedCards(memories, now).filter((c) => c.due <= now.getTime()).length;
}

export function chooseNextItem(args: {
  session: SessionState;
  memories: ReadonlyMap<number, SenseMemory>;
  now: Date;
  recentCorrect: readonly boolean[];
  /** Candidate new senses in teaching order (by frequency from the student's level). */
  newWords: readonly number[];
}): NextItem {
  const { session, memories, now } = args;
  const at = session.itemsShown;

  const miss = session.pendingMisses
    .filter((p) => p.atItem <= at)
    .sort((a, b) => a.atItem - b.atItem)[0];
  if (miss) return { kind: "missed", senseId: miss.senseId, card: miss.card };

  const check = session.pendingSecondChecks
    .filter((p) => p.atItem <= at)
    .sort((a, b) => a.atItem - b.atItem)[0];
  if (check) return { kind: "second_check", senseId: check.senseId, card: "recognition" };

  // Senses waiting for their own slot, and the one just asked, sit out rules 3 and 5.
  const waiting = new Set([
    ...session.pendingMisses.map((p) => p.senseId),
    ...session.pendingSecondChecks.map((p) => p.senseId),
  ]);
  const cards = studiedCards(memories, now).filter((c) => !waiting.has(c.senseId));
  const notLast = cards.filter((c) => c.senseId !== session.lastSenseId);
  const pool = notLast.length > 0 ? notLast : cards;

  const due = pool.filter((c) => c.due <= now.getTime()).sort((a, b) => a.recall - b.recall)[0];
  if (due) return { kind: "review", senseId: due.senseId, card: due.card };

  const fresh = args.newWords.find((id) => !memories.has(id));
  const gateOpen = isGateOpen({
    recentCorrect: args.recentCorrect,
    overdue: countOverdue(memories, now),
    newThisSession: session.newIntroduced,
  });
  if (fresh !== undefined && gateOpen) return { kind: "new", senseId: fresh };

  const soonest = [...pool].sort((a, b) => a.due - b.due)[0];
  if (soonest) return { kind: "early_review", senseId: soonest.senseId, card: soonest.card };

  // Nothing studied yet to review: a new word beats an idle student even with the gate shut.
  if (fresh !== undefined) return { kind: "new", senseId: fresh };
  const later = [...session.pendingMisses].sort((a, b) => a.atItem - b.atItem)[0];
  if (later) return { kind: "missed", senseId: later.senseId, card: later.card };
  return null;
}

/** Updates the session after an answer to `item`. */
export function recordAnswer(
  session: SessionState,
  item: Exclude<NextItem, null>,
  result: {
    correct: boolean;
    rng: Rng;
    /** "I already know this" answered correctly: no second check. */
    knownAlready?: boolean;
  },
): SessionState {
  const itemsShown = session.itemsShown + 1;
  const { missReturnAfterItems: miss, secondCheckAfterItems: check } = ENGINE_CONFIG.session;
  const next: SessionState = {
    itemsShown,
    newIntroduced: session.newIntroduced,
    lastSenseId: item.senseId,
    pendingMisses: session.pendingMisses.filter(
      (p) => !(item.kind === "missed" && p.senseId === item.senseId && p.card === item.card),
    ),
    pendingSecondChecks: session.pendingSecondChecks.filter(
      (p) => !(item.kind === "second_check" && p.senseId === item.senseId),
    ),
  };

  if (item.kind === "new") {
    next.newIntroduced += 1;
    if (!result.knownAlready) {
      next.pendingSecondChecks.push({
        senseId: item.senseId,
        atItem: itemsShown + randomInt(result.rng, check[0], check[1]),
      });
    }
  }
  if (!result.correct) {
    next.pendingMisses.push({
      senseId: item.senseId,
      card: "card" in item ? item.card : "recognition",
      atItem: itemsShown + randomInt(result.rng, miss[0], miss[1]),
    });
  }
  return next;
}
