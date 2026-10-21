import { describe, expect, it } from "vitest";
import { ENGINE_CONFIG } from "./config.ts";
import {
  estimatePlacement,
  newPlacement,
  nextPlacementItem,
  recordPlacementAnswer,
  type PlacementPool,
} from "./placement.ts";
import { seededRng, type Rng } from "./types.ts";

// Simulated test-takers: a true ability (ln of the rank where they know half the words) and
// how readily they say yes to words they don't know and to pseudowords.
const pool: PlacementPool = {
  words: Array.from({ length: 3000 }, (_, i) => ({ id: i + 1, rank: Math.round(1 + i * 3.3) })),
  pseudowords: Array.from({ length: 20 }, (_, i) => ({ id: i + 1 })),
};

function take(trueRank: number, overclaim: number, rng: Rng) {
  const { slope } = ENGINE_CONFIG.placement;
  let state = newPlacement();
  for (;;) {
    const item = nextPlacementItem(state, pool, rng);
    if (!item) break;
    let yes: boolean;
    if (item.kind === "pseudo") yes = rng() < overclaim;
    else {
      const know = 1 / (1 + Math.exp(-slope * (Math.log(trueRank) - Math.log(item.rank))));
      yes = rng() < know + (1 - know) * overclaim;
    }
    state = recordPlacementAnswer(state, item, yes);
  }
  return { state, result: estimatePlacement(state) };
}

describe("placement test", () => {
  it("asks about 40 items, about 10 of them pseudowords, never the same one twice", () => {
    const { state } = take(1000, 0.05, seededRng(1));
    expect(state.answers).toHaveLength(ENGINE_CONFIG.placement.items);
    const pseudo = state.answers.filter((a) => a.kind === "pseudo");
    expect(pseudo).toHaveLength(ENGINE_CONFIG.placement.pseudowords);
    const keys = state.answers.map((a) => `${a.kind}:${a.id}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it.each([
    // Starting level = where they know ~80% of words: about 0.4 × the rank they half know.
    [150, 1],
    [1200, 1],
    [3000, 3],
    [7000, 6],
  ])(
    "places an honest learner who half-knows words at rank %i near level %i",
    (trueRank, expected) => {
      const levels: number[] = [];
      for (let seed = 1; seed <= 15; seed++)
        levels.push(take(trueRank, 0.05, seededRng(seed)).result.level);
      const median = levels.sort((a, b) => a - b)[7]!;
      expect(Math.abs(median - expected)).toBeLessThanOrEqual(1);
    },
  );

  it("is not fooled by someone who says yes to everything", () => {
    const { result } = take(150, 0.95, seededRng(3));
    expect(result.reliable).toBe(false);
    expect(result.level).toBe(1);
  });

  it("corrects for mild overclaiming using the pseudowords", () => {
    const honest = take(1200, 0.05, seededRng(5)).result;
    const overclaimer = take(1200, 0.3, seededRng(5)).result;
    expect(overclaimer.reliable).toBe(true);
    expect(Math.abs(overclaimer.level - honest.level)).toBeLessThanOrEqual(2);
  });

  it("works with a small bank, asking each real word at most once", () => {
    const small: PlacementPool = {
      words: Array.from({ length: 25 }, (_, i) => ({ id: i + 1, rank: 1 + i * 180 })),
      pseudowords: pool.pseudowords.slice(0, 10),
    };
    let state = newPlacement();
    const rng = seededRng(9);
    for (
      let item = nextPlacementItem(state, small, rng);
      item;
      item = nextPlacementItem(state, small, rng)
    ) {
      state = recordPlacementAnswer(state, item, item.kind === "word" && item.rank < 900);
    }
    expect(state.answers.filter((a) => a.kind === "word")).toHaveLength(25);
    expect(estimatePlacement(state).level).toBeGreaterThanOrEqual(1);
  });
});
