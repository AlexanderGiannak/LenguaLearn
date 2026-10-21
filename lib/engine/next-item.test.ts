import { describe, expect, it } from "vitest";
import { Rating } from "ts-fsrs";
import { applyReview, markKnown, newSenseMemory, type SenseMemory } from "./cards.ts";
import { ENGINE_CONFIG } from "./config.ts";
import {
  chooseNextItem,
  countOverdue,
  isGateOpen,
  newSession,
  recordAnswer,
  type NextItem,
  type SessionState,
} from "./next-item.ts";
import { seededRng } from "./types.ts";

const DAY = 86_400_000;
const t0 = new Date("2026-10-01T15:00:00Z");
const at = (days: number) => new Date(t0.getTime() + days * DAY);

function reviewed(): SenseMemory {
  return applyReview(newSenseMemory(t0), "recognition", Rating.Good, t0).memory;
}

describe("isGateOpen", () => {
  const ok = Array<boolean>(10).fill(true);
  it("opens with a good recent record, few overdue and few new words", () => {
    expect(isGateOpen({ recentCorrect: ok, overdue: 0, newThisSession: 0 })).toBe(true);
  });
  it("closes below 75% over the last 10 answers", () => {
    const record = [...Array<boolean>(7).fill(true), false, false, false];
    expect(isGateOpen({ recentCorrect: record, overdue: 0, newThisSession: 0 })).toBe(false);
  });
  it("looks only at the last 10 answers", () => {
    const record = [...Array<boolean>(20).fill(false), ...ok];
    expect(isGateOpen({ recentCorrect: record, overdue: 0, newThisSession: 0 })).toBe(true);
  });
  it("is open for a first answer", () => {
    expect(isGateOpen({ recentCorrect: [], overdue: 0, newThisSession: 0 })).toBe(true);
  });
  it("closes at 20 overdue reviews", () => {
    expect(isGateOpen({ recentCorrect: ok, overdue: 19, newThisSession: 0 })).toBe(true);
    expect(isGateOpen({ recentCorrect: ok, overdue: 20, newThisSession: 0 })).toBe(false);
  });
  it("closes after 8 new words in a session", () => {
    expect(isGateOpen({ recentCorrect: ok, overdue: 0, newThisSession: 7 })).toBe(true);
    expect(isGateOpen({ recentCorrect: ok, overdue: 0, newThisSession: 8 })).toBe(false);
  });
});

describe("chooseNextItem", () => {
  const base = { recentCorrect: [] as boolean[], newWords: [] as number[] };

  it("brings a missed item back 3–5 items later, ahead of everything else", () => {
    const rng = seededRng(4);
    let session = newSession();
    const memories = new Map([
      [1, reviewed()],
      [2, reviewed()],
    ]);
    session = recordAnswer(
      session,
      { kind: "review", senseId: 1, card: "recognition" },
      { correct: false, rng },
    );
    const back = session.pendingMisses[0]!.atItem;
    expect(back).toBeGreaterThanOrEqual(1 + 3);
    expect(back).toBeLessThanOrEqual(1 + 5);

    session = { ...session, itemsShown: back };
    const next = chooseNextItem({ ...base, session, memories, now: at(10), newWords: [3] });
    expect(next).toEqual({ kind: "missed", senseId: 1, card: "recognition" });
  });

  it("gives a new word its second check 4–6 items after the intro", () => {
    const rng = seededRng(9);
    let session = recordAnswer(newSession(), { kind: "new", senseId: 7 }, { correct: true, rng });
    const check = session.pendingSecondChecks[0]!.atItem;
    expect(check).toBeGreaterThanOrEqual(1 + 4);
    expect(check).toBeLessThanOrEqual(1 + 6);
    session = { ...session, itemsShown: check };
    const memories = new Map([[7, reviewed()]]);
    expect(chooseNextItem({ ...base, session, memories, now: t0 })).toEqual({
      kind: "second_check",
      senseId: 7,
      card: "recognition",
    });
  });

  it("does not schedule a second check for a word marked as already known", () => {
    const session = recordAnswer(
      newSession(),
      { kind: "new", senseId: 7 },
      { correct: true, rng: seededRng(1), knownAlready: true },
    );
    expect(session.pendingSecondChecks).toEqual([]);
  });

  it("picks the due review with the lowest predicted recall", () => {
    const memories = new Map<number, SenseMemory>([
      [1, reviewed()], // due after a few days
      [2, markKnown(newSenseMemory(t0), t0)], // due after ~8 days
    ]);
    const next = chooseNextItem({ ...base, session: newSession(), memories, now: at(9) });
    expect(next).toEqual({ kind: "review", senseId: 1, card: "recognition" });
  });

  it("introduces a new word when nothing is due and the gate is open", () => {
    const memories = new Map([[1, reviewed()]]);
    const next = chooseNextItem({
      ...base,
      session: newSession(),
      memories,
      now: t0,
      newWords: [1, 5, 6],
    });
    expect(next).toEqual({ kind: "new", senseId: 5 });
  });

  it("with the gate closed and nothing due, reviews the card closest to its due date", () => {
    const memories = new Map<number, SenseMemory>([
      [1, reviewed()],
      [2, markKnown(newSenseMemory(t0), t0)],
    ]);
    const session: SessionState = {
      ...newSession(),
      newIntroduced: ENGINE_CONFIG.newWordGate.maxNewPerSession,
    };
    const next = chooseNextItem({ ...base, session, memories, now: t0, newWords: [5] });
    expect(next).toEqual({ kind: "early_review", senseId: 1, card: "recognition" });
  });

  it("never asks about the same sense twice in a row when anything else is possible", () => {
    const memories = new Map([
      [1, reviewed()],
      [2, reviewed()],
    ]);
    const session = { ...newSession(), lastSenseId: 1, itemsShown: 3 };
    const next = chooseNextItem({ ...base, session, memories, now: at(10) }) as Exclude<
      NextItem,
      null
    >;
    expect(next.senseId).toBe(2);
  });

  it("counts both cards of a sense as separate reviews", () => {
    const m = markKnown(newSenseMemory(t0), t0);
    expect(countOverdue(new Map([[1, m]]), at(400))).toBe(2);
  });

  it("returns null only when there is nothing at all to study", () => {
    expect(
      chooseNextItem({ ...base, session: newSession(), memories: new Map(), now: t0 }),
    ).toBeNull();
  });
});
