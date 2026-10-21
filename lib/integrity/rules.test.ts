import { describe, expect, it } from "vitest";
import { INTEGRITY_CONFIG as C } from "./config";
import { evaluateFlags, minReadingMs, type RecentAnswer } from "./rules";

let nextId = 1;
const a = (over: Partial<RecentAnswer> = {}): RecentAnswer => ({
  id: nextId++,
  responseMs: 4000,
  correct: true,
  dontKnow: false,
  chosenIndex: 0,
  minReadingMs: 1000,
  hiddenReturnMs: null,
  flagged: false,
  ...over,
});

describe("minReadingMs", () => {
  it("is 1 second for a short 4-option meaning question", () => {
    expect(minReadingMs(30)).toBe(C.minReadingBaseMs);
  });
  it("scales up with the text on screen", () => {
    expect(minReadingMs(140)).toBe(C.minReadingBaseMs + 100 * C.minReadingMsPerChar);
  });
});

describe("evaluateFlags", () => {
  it("flags three fast answers in a row with accuracy under 50%", () => {
    const history = [
      a({ responseMs: 400, correct: false }),
      a({ responseMs: 500, correct: false }),
    ];
    const current = a({ responseMs: 300, correct: true });
    const r = evaluateFlags(history, current);
    expect(r.flag.map((f) => f.id).sort()).toEqual(
      [history[0]!.id, history[1]!.id, current.id].sort(),
    );
    expect(r.flag.every((f) => f.reason === "fast")).toBe(true);
    expect(r.notify).toBe(true);
  });

  it("does not flag fast answers that are mostly right", () => {
    const history = [a({ responseMs: 400 }), a({ responseMs: 500, correct: false })];
    expect(evaluateFlags(history, a({ responseMs: 300 })).flag).toEqual([]);
  });

  it("does not flag two fast answers", () => {
    expect(
      evaluateFlags(
        [a({ responseMs: 400, correct: false })],
        a({ responseMs: 300, correct: false }),
      ).flag,
    ).toEqual([]);
  });

  it("measures fast against each question's own reading time", () => {
    const history = [
      a({ responseMs: 1500, minReadingMs: 2500, correct: false }),
      a({ responseMs: 1500, minReadingMs: 2500, correct: false }),
    ];
    expect(
      evaluateFlags(history, a({ responseMs: 1500, minReadingMs: 2500, correct: false })).flag,
    ).toHaveLength(3);
    const slowEnough = [
      a({ responseMs: 1500, correct: false }),
      a({ responseMs: 1500, correct: false }),
    ];
    expect(evaluateFlags(slowEnough, a({ responseMs: 1500, correct: false })).flag).toEqual([]);
  });

  it("flags the same option position six times in a row while wrong", () => {
    const history = Array.from({ length: 5 }, () => a({ chosenIndex: 2, correct: false }));
    const r = evaluateFlags(history, a({ chosenIndex: 2, correct: false }));
    expect(r.flag).toHaveLength(6);
    expect(r.flag[0]!.reason).toBe("same_position");
  });

  it("does not flag the same position when some of those were right", () => {
    const history = [
      ...Array.from({ length: 4 }, () => a({ chosenIndex: 2, correct: false })),
      a({ chosenIndex: 2, correct: true }),
    ];
    expect(evaluateFlags(history, a({ chosenIndex: 2, correct: false })).flag).toEqual([]);
  });

  it("flags an answer given within 2 seconds of returning to a hidden tab", () => {
    const r = evaluateFlags([], a({ hiddenReturnMs: 1500 }));
    expect(r.flag).toEqual([{ id: expect.any(Number), reason: "hidden_tab" }]);
    expect(evaluateFlags([], a({ hiddenReturnMs: 2500 })).flag).toEqual([]);
  });

  it("never flags I don't know", () => {
    const history = [
      a({ responseMs: 300, dontKnow: true, correct: false }),
      a({ responseMs: 300, dontKnow: true, correct: false }),
    ];
    expect(
      evaluateFlags(
        history,
        a({ responseMs: 300, dontKnow: true, correct: false, hiddenReturnMs: 500 }),
      ).flag,
    ).toEqual([]);
  });

  it("does not let I don't know join a fast streak", () => {
    const history = [
      a({ responseMs: 300, correct: false }),
      a({ responseMs: 300, dontKnow: true, correct: false }),
    ];
    expect(evaluateFlags(history, a({ responseMs: 300, correct: false })).flag).toEqual([]);
  });

  it("extends an already-flagged stretch without telling the student again", () => {
    const history = [
      a({ responseMs: 300, correct: false, flagged: true }),
      a({ responseMs: 300, correct: false, flagged: true }),
      a({ responseMs: 300, correct: false, flagged: true }),
    ];
    const current = a({ responseMs: 300, correct: false });
    const r = evaluateFlags(history, current);
    expect(r.flag.map((f) => f.id)).toEqual([current.id]);
    expect(r.notify).toBe(false);
  });
});
