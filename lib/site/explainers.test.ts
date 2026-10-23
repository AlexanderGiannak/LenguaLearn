import { describe, expect, it } from "vitest";
import { ENGINE_CONFIG } from "@/lib/engine/config";
import { placementTrace, reviewCurves, zipfCoverage } from "./explainers";

describe("reviewCurves", () => {
  const c = reviewCurves(60);

  it("reviews at growing gaps", () => {
    const gaps = c.reviewDays.slice(1).map((d, i) => d - c.reviewDays[i]!);
    expect(gaps.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < gaps.length; i++) expect(gaps[i]!).toBeGreaterThan(gaps[i - 1]!);
  });

  it("brings a word back when predicted recall falls to the target", () => {
    for (const day of c.reviewDays.slice(1)) {
      const before = c.withReviews.filter((p) => p.day < day).at(-1)!;
      expect(before.recall).toBeGreaterThan(ENGINE_CONFIG.fsrs.requestRetention - 0.03);
    }
  });

  it("starts production practice later, on its own schedule", () => {
    expect(c.productionFromDay).toBeGreaterThan(0);
    expect(c.productionReviewDays[0]).toBe(c.productionFromDay);
    expect(c.reviewDays).toContain(c.productionFromDay);
  });

  it("forgets without reviews", () => {
    expect(c.withoutReviews.at(-1)!.recall).toBeLessThan(0.7);
    expect(c.withReviews.at(-1)!.recall).toBeGreaterThan(0.85);
  });
});

describe("placementTrace", () => {
  it("asks the configured number of items and settles near the learner's level", () => {
    const t = placementTrace(2_000);
    expect(t.steps).toHaveLength(ENGINE_CONFIG.placement.items);
    expect(t.steps.filter((s) => s.kind === "pseudo")).toHaveLength(
      ENGINE_CONFIG.placement.pseudowords,
    );
    const last = t.steps.at(-1)!.estimateRank!;
    expect(last).toBeGreaterThan(1_000);
    expect(last).toBeLessThan(4_000);
  });
});

describe("zipfCoverage", () => {
  it("rises with each level and the first level covers the most", () => {
    const c = zipfCoverage(6);
    expect(c).toHaveLength(6);
    for (let i = 1; i < c.length; i++) expect(c[i]!.share).toBeGreaterThan(c[i - 1]!.share);
    expect(c[0]!.share).toBeGreaterThan(c[1]!.share - c[0]!.share);
  });
});
