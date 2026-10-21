import { ENGINE_CONFIG } from "./config.ts";
import type { Rng } from "./types.ts";

// Placement (spec: Placement). A yes/no vocabulary test in the LexTALE-Esp style: "Do you
// know this word?" for real words across frequency bands and some made-up pseudowords.
// Saying yes to pseudowords shows overclaiming, and the estimate corrects for it. Items adapt
// toward the frequency where answers start to change. The result is an ability on the same
// log-rank scale as lib/engine/ability.ts, and a starting level.

export type PlacementPool = {
  words: readonly { id: number; rank: number }[];
  pseudowords: readonly { id: number }[];
};

export type PlacementItem =
  { kind: "word"; id: number; rank: number } | { kind: "pseudo"; id: number };
export type PlacementAnswer = PlacementItem & { yes: boolean };
export type PlacementState = { answers: PlacementAnswer[] };

export type PlacementResult = {
  /** Ability: ln of the rank where the learner knows about half the words. */
  ability: number;
  level: number;
  falseAlarmRate: number;
  /** False when the learner said yes to too many pseudowords to trust the result. */
  reliable: boolean;
};

const C = () => ENGINE_CONFIG.placement;
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

export function newPlacement(): PlacementState {
  return { answers: [] };
}

export function recordPlacementAnswer(
  state: PlacementState,
  item: PlacementItem,
  yes: boolean,
): PlacementState {
  return { answers: [...state.answers, { ...item, yes }] };
}

function falseAlarmRate(state: PlacementState): number {
  const pseudo = state.answers.filter((a) => a.kind === "pseudo");
  // Smoothed, so no answers yet means "a little" rather than zero.
  const rate = (pseudo.filter((a) => a.yes).length + 0.5) / (pseudo.length + 1);
  return Math.min(0.95, Math.max(0.01, rate));
}

/** Maximum-likelihood ability given the word answers and the false-alarm rate. */
function abilityEstimate(state: PlacementState): number {
  const words = state.answers.filter(
    (a): a is PlacementAnswer & { kind: "word" } => a.kind === "word",
  );
  if (words.length === 0) return Math.log(500);
  const fa = falseAlarmRate(state);
  let best = Math.log(10);
  let bestLik = -Infinity;
  for (let theta = Math.log(10); theta <= Math.log(40_000); theta += 0.02) {
    let lik = 0;
    for (const w of words) {
      const know = sigmoid(C().slope * (theta - Math.log(w.rank)));
      const pYes = know + (1 - know) * fa;
      lik += Math.log(w.yes ? pYes : 1 - pYes);
    }
    if (lik > bestLik) [best, bestLik] = [theta, lik];
  }
  return best;
}

export function estimatePlacement(state: PlacementState): PlacementResult {
  const fa = falseAlarmRate(state);
  const reliable = fa < C().maxFalseAlarms;
  const ability = abilityEstimate(state);
  // The rank at which the learner knows about 80% of words: start teaching there.
  const share = C().knownShareAtStart;
  const startRank = Math.exp(ability - Math.log(share / (1 - share)) / C().slope);
  const level = reliable
    ? Math.max(1, Math.floor(Math.max(0, startRank - 1) / ENGINE_CONFIG.levelBandSize) + 1)
    : 1;
  return {
    ability: reliable ? ability : ENGINE_CONFIG.ability.beginnerAbility,
    level,
    falseAlarmRate: fa,
    reliable,
  };
}

/** The next item, or null when the test is done. */
export function nextPlacementItem(
  state: PlacementState,
  pool: PlacementPool,
  rng: Rng,
): PlacementItem | null {
  const asked = new Set(state.answers.map((a) => `${a.kind}:${a.id}`));
  const words = pool.words.filter((w) => !asked.has(`word:${w.id}`));
  const pseudo = pool.pseudowords.filter((p) => !asked.has(`pseudo:${p.id}`));
  const total = Math.min(
    C().items,
    pool.words.length + Math.min(C().pseudowords, pool.pseudowords.length),
  );
  const n = state.answers.length;
  if (n >= total) return null;

  // Spread the pseudowords evenly through the test.
  const pseudoTarget = Math.min(C().pseudowords, pool.pseudowords.length);
  const pseudoSoFar = state.answers.filter((a) => a.kind === "pseudo").length;
  const pseudoDue = Math.round(((n + 1) * pseudoTarget) / total) > pseudoSoFar;
  if ((pseudoDue || words.length === 0) && pseudo.length > 0) {
    const p = pseudo[Math.floor(rng() * pseudo.length)]!;
    return { kind: "pseudo", id: p.id };
  }
  if (words.length === 0) return null;

  // First probe fixed bands, then adapt around the current estimate.
  const wordsSoFar = n - pseudoSoFar;
  const probes = C().probeRanks;
  const target =
    wordsSoFar < probes.length
      ? Math.log(probes[wordsSoFar]!)
      : abilityEstimate(state) + (rng() - 0.5) * 1.4;
  let pick = words[0]!;
  let bestDist = Infinity;
  for (const w of words) {
    const d = Math.abs(Math.log(w.rank) - target);
    if (d < bestDist) [pick, bestDist] = [w, d];
  }
  return { kind: "word", id: pick.id, rank: pick.rank };
}
