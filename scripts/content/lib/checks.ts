// The automatic checks of content pipeline step 3, on one generated word. They never reject
// a word outright: each problem is recorded as a failure, and a sense with any failure goes
// to the review queue instead of moving to ai_checked. Only an example that cannot be
// stored at all (its word is missing from the sentence) is left out of the import, with a
// failure that says so.

import { countWords, MAX_SENTENCE_WORDS } from "../../../lib/content/import-schema.ts";
import { locate } from "../../../lib/content/locate.ts";

export { locate };
import { EXAMPLES_PER_SENSE, MISUSES_PER_SENSE, type GeneratedSense } from "./generated.ts";

/** What the checks need from Wiktionary (the word-list LemmaIndex provides it). */
export type Lexicon = {
  formsOf: ReadonlyMap<string, ReadonlySet<string>>;
  isFunctionWord(headword: string): boolean;
};

export type Failure = { field: string; check: string; message: string };

export function words(text: string): string[] {
  return text.toLocaleLowerCase("es").match(/[\p{L}]+/gu) ?? [];
}

/**
 * Capitalized words that are names: capitalized after the first word, or anywhere if no
 * lowercase word is spelled that way. Names are allowed at every level.
 */
export function names(text: string, lexicon: Lexicon): Set<string> {
  const tokens = text.match(/[\p{L}]+/gu) ?? [];
  return new Set(
    tokens
      .filter((t, i) => {
        if (t[0] === t[0]!.toLocaleLowerCase("es")) return false;
        const lower = t.toLocaleLowerCase("es");
        return i > 0 || !lexicon.formsOf.has(lower);
      })
      .map((t) => t.toLocaleLowerCase("es")),
  );
}

export type CheckedExample = GeneratedSense["examples"][number] & { start: number; end: number };

export type SenseCheck = {
  failures: Failure[];
  /** Examples that can be stored, with offsets. */
  examples: CheckedExample[];
};

/**
 * Checks one sense of a generated lemma.
 * - allowed: for vocabulary-limited levels, the headwords a sentence may use.
 * - seen: every example sentence checked so far in this run, to catch duplicates across
 *   words. The check adds this sense's sentences to it.
 */
export function checkSense(
  headword: string,
  sense: GeneratedSense,
  path: string,
  lexicon: Lexicon,
  seen: Map<string, string>,
  allowed?: ReadonlySet<string>,
): SenseCheck {
  const failures: Failure[] = [];
  const fail = (field: string, check: string, message: string) =>
    failures.push({ field: `${path}.${field}`, check, message });
  const examples: CheckedExample[] = [];
  const target = headword.toLocaleLowerCase("es");
  const formsOfTarget = (form: string) =>
    form === target || (lexicon.formsOf.get(form)?.has(target) ?? false);

  if (sense.examples.length !== EXAMPLES_PER_SENSE)
    fail("examples", "count", `has ${sense.examples.length} examples, not ${EXAMPLES_PER_SENSE}`);
  if (sense.misuses.length !== MISUSES_PER_SENSE)
    fail("misuses", "count", `has ${sense.misuses.length} misuses, not ${MISUSES_PER_SENSE}`);

  sense.examples.forEach((ex, i) => {
    const at = `examples.${i}`;
    const text = ex.text.normalize("NFC").trim();
    const surface = ex.surfaceForm.normalize("NFC").trim();
    const place = locate(text, surface);
    if ("error" in place) fail(at, "offsets", `${place.error}; example left out`);
    else examples.push({ ...ex, text, surfaceForm: surface, ...place });

    if (countWords(text) > MAX_SENTENCE_WORDS)
      fail(at, "length", `${countWords(text)} words, over ${MAX_SENTENCE_WORDS}`);

    // Wiktionary's tables miss forms with attached pronouns, so this sends the example to
    // review rather than dropping it.
    const form = surface.toLocaleLowerCase("es");
    if (!formsOfTarget(form))
      fail(at, "inflection", `"${surface}" is not a known form of ${headword}`);

    const key = text.toLocaleLowerCase("es");
    const earlier = seen.get(key);
    if (earlier) fail(at, "duplicate", `same sentence as ${earlier}`);
    else seen.set(key, `${headword} ${path}.${at}`);

    const distractors = ex.distractors.map((d) => d.normalize("NFC").trim());
    const lowered = distractors.map((d) => d.toLocaleLowerCase("es"));
    if (distractors.length !== 3)
      fail(`${at}.distractors`, "count", `has ${distractors.length}, not 3`);
    if (new Set(lowered).size !== lowered.length)
      fail(`${at}.distractors`, "distinct", "repeats a distractor");
    for (const d of lowered) {
      if (formsOfTarget(d)) fail(`${at}.distractors`, "own-form", `"${d}" is a form of the word`);
      else if (!lexicon.formsOf.has(d))
        fail(`${at}.distractors`, "unknown", `"${d}" is not a known Spanish word form`);
    }

    if (allowed) {
      const named = names(text, lexicon);
      const outside = words(text).filter(
        (w) =>
          !formsOfTarget(w) &&
          !named.has(w) &&
          ![...(lexicon.formsOf.get(w) ?? [])].some(
            (h) => allowed.has(h) || lexicon.isFunctionWord(h),
          ),
      );
      // The prompt allows one very common word outside the list.
      if (outside.length > 1)
        fail(at, "vocabulary", `uses words above this level: ${outside.join(", ")}`);
    }
  });

  sense.misuses.forEach((m, i) => {
    const text = m.text.normalize("NFC").trim();
    if (countWords(text) > MAX_SENTENCE_WORDS)
      fail(`misuses.${i}`, "length", `${countWords(text)} words, over ${MAX_SENTENCE_WORDS}`);
    if (!words(text).some(formsOfTarget))
      fail(`misuses.${i}`, "missing-word", `does not use ${headword}`);
  });

  return { failures, examples };
}
