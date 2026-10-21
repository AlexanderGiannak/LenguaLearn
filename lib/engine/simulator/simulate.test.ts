import { describe, expect, it } from "vitest";
import { buildBank, simulate, type SimOptions } from "./simulate.ts";

const opts: SimOptions = {
  cohort: "beginner",
  learners: 3,
  days: 14,
  seed: 7,
  trainingDaysPerWeek: 5,
  sessionMinutes: 15,
  productionUnlockStabilityDays: 3,
};
const bank = buildBank(1500, 7);

describe("simulator", () => {
  it("runs learners through sessions on training days only", () => {
    const [learner] = simulate(opts, bank);
    const trained = learner!.days.filter((d) => d.trained);
    expect(trained).toHaveLength(10);
    expect(learner!.days.filter((d) => !d.trained).every((d) => d.answers === 0)).toBe(true);
    expect(trained.every((d) => d.answers > 50 && d.newWords > 0)).toBe(true);
    expect(learner!.studiedAtEnd).toBeGreaterThan(40);
  });

  it("is repeatable for a given seed", () => {
    expect(simulate(opts, bank)).toEqual(simulate(opts, bank));
  });

  it("never introduces more new words in a session than the cap", () => {
    const results = simulate({ ...opts, cohort: "intermediate" }, bank);
    for (const r of results) for (const d of r.days) expect(d.newWords).toBeLessThanOrEqual(8);
  });
});
