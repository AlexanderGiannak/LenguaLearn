// Placement-test pseudowords (spec: Placement; DECISIONS 2026-11-24): made-up words that
// look Spanish. A "pseudoword" that is really a word, or that a student could misread as a
// common word, would count a right answer as a false alarm, so candidates are filtered
// against Wiktionary and the frequency list before a person reviews them.

/** The import schema's rule for a pseudoword. */
export const PSEUDOWORD_PATTERN = /^[a-záéíóúüñ]{4,14}$/;

/** Whether two words are one edit apart (substitution, insertion or deletion). */
export function oneEditApart(a: string, b: string): boolean {
  if (a === b || Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  return short.slice(i) === long.slice(i + 1);
}

/** Strips accents, so "cása" and "casa" count as the same spelling to a reader. */
export function unaccented(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").normalize("NFC");
}

export type PseudowordVerdict = { word: string; ok: boolean; reason?: string };

/**
 * Filters candidate pseudowords.
 * - known: every Spanish word form we know of (Wiktionary forms and the frequency list).
 * - common: the most frequent forms, which a quick reader could mistake a near-miss for.
 */
export function filterPseudowords(
  candidates: string[],
  known: ReadonlySet<string>,
  common: readonly string[],
): PseudowordVerdict[] {
  const knownPlain = new Set([...known].map(unaccented));
  const commonPlain = common.map(unaccented);
  const seen = new Set<string>();
  return candidates.map((raw) => {
    const word = raw.normalize("NFC").trim().toLocaleLowerCase("es");
    const plain = unaccented(word);
    const no = (reason: string) => ({ word, ok: false, reason });
    if (!PSEUDOWORD_PATTERN.test(word)) return no("not 4–14 lowercase Spanish letters");
    if (seen.has(plain)) return no("repeated");
    seen.add(plain);
    if (knownPlain.has(plain)) return no("a real word or word form");
    const near = commonPlain.find((c) => oneEditApart(plain, c));
    if (near) return no(`one letter from the common word "${near}"`);
    return { word, ok: true };
  });
}
