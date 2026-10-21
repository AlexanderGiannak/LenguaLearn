import { describe, expect, it } from "vitest";
import { DEFAULT_FORMULA, percentOfGoal, seatStatus, suggestedGrade } from "./grades";

const row = { minutes: 30, goalMinutes: 45, accuracy: 80, flaggedMinutes: 0 };

describe("suggestedGrade", () => {
  it("defaults to percent of goal (owner's choice)", () => {
    expect(DEFAULT_FORMULA).toEqual({ goalWeight: 1, accuracyWeight: 0, flaggedDeduction: 0 });
    expect(suggestedGrade(row, DEFAULT_FORMULA)).toBe(67);
  });

  it("caps percent of goal at 100", () => {
    expect(suggestedGrade({ ...row, minutes: 90 }, DEFAULT_FORMULA)).toBe(100);
  });

  it("mixes in accuracy by weight", () => {
    // 0.8 × 66.7 + 0.2 × 80 = 69.3
    expect(suggestedGrade(row, { goalWeight: 0.8, accuracyWeight: 0.2, flaggedDeduction: 0 })).toBe(
      69,
    );
  });

  it("treats weights as relative", () => {
    expect(suggestedGrade(row, { goalWeight: 4, accuracyWeight: 1, flaggedDeduction: 0 })).toBe(69);
  });

  it("deducts per flagged minute, never below 0", () => {
    const f = { goalWeight: 1, accuracyWeight: 0, flaggedDeduction: 2 };
    expect(suggestedGrade({ ...row, flaggedMinutes: 5 }, f)).toBe(57);
    expect(suggestedGrade({ ...row, flaggedMinutes: 500 }, f)).toBe(0);
  });

  it("gives 0 accuracy credit when a student answered nothing", () => {
    expect(
      suggestedGrade(
        { ...row, minutes: 0, accuracy: null },
        { goalWeight: 1, accuracyWeight: 1, flaggedDeduction: 0 },
      ),
    ).toBe(0);
  });

  it("is 0 when every weight is 0", () => {
    expect(suggestedGrade(row, { goalWeight: 0, accuracyWeight: 0, flaggedDeduction: 0 })).toBe(0);
  });
});

describe("percentOfGoal", () => {
  it("is not capped, for display", () => {
    expect(percentOfGoal(90, 45)).toBe(200);
    expect(percentOfGoal(10, 0)).toBe(0);
  });
});

describe("seatStatus", () => {
  const base = {
    minutes: 20,
    flaggedMinutes: 0,
    goalMinutes: 45,
    weekElapsed: 0.5,
    activeThisWeek: true,
  };
  it("is Not started with no activity this week", () => {
    expect(seatStatus({ ...base, minutes: 0, activeThisWeek: false })).toBe("not_started");
  });
  it("is On track when keeping pace with the goal", () => {
    expect(seatStatus({ ...base, minutes: 23 })).toBe("on_track");
  });
  it("is Behind below pace", () => {
    expect(seatStatus({ ...base, minutes: 10 })).toBe("behind");
  });
  it("is On track once the goal is met, whatever the day", () => {
    expect(seatStatus({ ...base, minutes: 45, weekElapsed: 0.1 })).toBe("on_track");
  });
  it("is Flagged when flagged time is a large share", () => {
    expect(seatStatus({ ...base, minutes: 20, flaggedMinutes: 8 })).toBe("flagged");
    // 2 of 22 minutes flagged: below both thresholds, so the usual pace check applies.
    expect(seatStatus({ ...base, minutes: 23, flaggedMinutes: 2 })).toBe("on_track");
  });
});
