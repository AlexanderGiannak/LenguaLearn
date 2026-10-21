// What the engine needs to know about content. The app maps live database rows into these
// shapes; the simulator builds synthetic ones. The engine never imports the database.

export type EngineExample = {
  id: number;
  text: string;
  surfaceForm: string;
  start: number;
  end: number;
  /** Three reviewed cloze distractor forms, or empty. */
  distractors: readonly string[];
};

export type EngineSense = {
  id: number;
  lemmaId: number;
  headword: string;
  partOfSpeech: string;
  /** Noun article for display and gender questions; null for other parts of speech. */
  article: "el" | "la" | "el/la" | null;
  gloss: string;
  frequencyRank: number;
  level: number;
  /** Measured difficulty once fitted from answers; null until then. */
  difficulty: number | null;
  cognate: "none" | "true_cognate" | "false_friend";
  hasWordParts: boolean;
  synonymIds: readonly number[];
  antonymIds: readonly number[];
  familyIds: readonly number[];
  confusedIds: readonly number[];
  examples: readonly EngineExample[];
};

/** A random number generator returning values in [0, 1). Injected so tests are repeatable. */
export type Rng = () => number;

/** Small seeded generator (mulberry32) for tests and the simulator. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
