import { describe, expect, it } from "vitest";
import { levelForRank } from "./levels";

describe("levelForRank", () => {
  it.each([
    [1, 1],
    [500, 1],
    [501, 2],
    [1000, 2],
    [1001, 3],
    [10_000, 20],
    [1_000_000, 2000],
  ])("rank %i is level %i", (rank, level) => {
    expect(levelForRank(rank)).toBe(level);
  });

  it.each([0, -1, 1.5, Number.NaN])("rejects rank %s", (rank) => {
    expect(() => levelForRank(rank)).toThrow();
  });
});
