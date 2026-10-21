import { LEVEL_BAND_SIZE } from "./constants";

/**
 * Level 1 is ranks 1–500, level 2 is 501–1,000, and so on with no top (spec: Levels).
 * The database computes the same value as a generated column on `sense`.
 */
export function levelForRank(rank: number): number {
  if (!Number.isInteger(rank) || rank < 1) {
    throw new RangeError(`frequency rank must be a positive integer, got ${rank}`);
  }
  return Math.floor((rank - 1) / LEVEL_BAND_SIZE) + 1;
}
