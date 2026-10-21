import type { EngineSense, Rng } from "./types.ts";
import { shuffle } from "./types.ts";

// Wrong options must be plausible and must not also be right (spec: Distractors).

/** True if a and b are linked as synonyms, same family or commonly confused, either way. */
export function areRelated(a: EngineSense, b: EngineSense): boolean {
  const links = (x: EngineSense, y: EngineSense) =>
    x.synonymIds.includes(y.id) || x.familyIds.includes(y.id) || x.confusedIds.includes(y.id);
  return a.lemmaId === b.lemmaId || links(a, b) || links(b, a);
}

/**
 * Picks `count` wrong senses for a question about `target`: same part of speech, similar
 * level and gloss length, and never a word that could also be right.
 */
export function pickDistractors(
  target: EngineSense,
  pool: readonly EngineSense[],
  rng: Rng,
  count = 3,
  exclude: ReadonlySet<number> = new Set(),
): EngineSense[] {
  const gloss = target.gloss.toLocaleLowerCase("en");
  const usable = pool.filter(
    (s) =>
      s.id !== target.id &&
      !exclude.has(s.id) &&
      !areRelated(target, s) &&
      s.headword !== target.headword &&
      s.gloss.toLocaleLowerCase("en") !== gloss,
  );
  let candidates = usable.filter((s) => s.partOfSpeech === target.partOfSpeech);
  // A young bank may not have enough words of one part of speech yet.
  if (candidates.length < count) candidates = usable;

  const scored = candidates
    .map((s) => ({
      s,
      score:
        Math.abs(s.level - target.level) +
        Math.abs(s.gloss.length - target.gloss.length) / 20 +
        rng() * 0.5,
    }))
    .sort((a, b) => a.score - b.score);

  // Choose at random among the closest few, so the same three do not always appear.
  const picked: EngineSense[] = [];
  const seenText = new Set<string>();
  for (const { s } of shuffle(scored.slice(0, count * 3), rng)) {
    const key = `${s.headword}|${s.gloss.toLocaleLowerCase("en")}`;
    if (seenText.has(key)) continue;
    seenText.add(key);
    picked.push(s);
    if (picked.length === count) break;
  }
  return picked;
}
