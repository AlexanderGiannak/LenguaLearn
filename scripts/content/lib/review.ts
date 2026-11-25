// The independent check of content pipeline step 3: a model from another provider reviews
// each generated word without seeing how it was written. Its answer mirrors the generated
// word, so every field gets a verdict, and turns into the same failures as the automatic
// checks.
import { z } from "zod";
import type { Failure } from "./checks.ts";
import type { GeneratedWord } from "./generated.ts";

const verdict = z.object({ pass: z.boolean(), reason: z.string() });

export const reviewSchema = z.object({
  lemmas: z.array(
    z.object({
      /** Headword, part of speech, gender and article. */
      headword: verdict,
      /** Plural, feminine and the irregular-forms note. */
      forms: verdict,
      wordParts: verdict,
      senses: z.array(
        z.object({
          /** The reviewer's own short English gloss, shown next to the generated one. */
          ownGloss: z.string(),
          gloss: verdict,
          definition: verdict,
          /** Register, region, cognate status and concreteness. */
          labels: verdict,
          imageDescription: verdict,
          hook: verdict,
          relations: verdict,
          examples: z.array(
            z.object({
              sentence: verdict,
              translation: verdict,
              /** Distractors that would also make a correct, sensible sentence. */
              distractorsThatFit: z.array(z.string()),
            }),
          ),
          misuses: z.array(
            z.object({
              /** True when the "wrong" sentence is in fact acceptable Spanish. */
              actuallyCorrect: z.boolean(),
              reason: z.string(),
            }),
          ),
        }),
      ),
    }),
  ),
});

export type Review = z.infer<typeof reviewSchema>;

/** What the reviewer sees: the content only, never the generator's reasoning or costs. */
export function reviewInput(word: GeneratedWord, candidate: { lemma: string; level: number }) {
  return {
    candidate: candidate.lemma,
    level: candidate.level,
    lemmas: word.lemmas.map((l) => ({
      headword: l.headword,
      partOfSpeech: l.partOfSpeech,
      gender: l.gender,
      articleOverride: l.articleOverride,
      plural: l.plural,
      feminine: l.feminine,
      formsNote: l.formsNote,
      wordParts: l.wordParts,
      senses: l.senses.map((s) => ({
        gloss: s.gloss,
        definition: s.definition,
        register: s.register,
        region: s.region,
        cognate: s.cognate,
        cognateEnglish: s.cognateEnglish,
        concreteness: s.concreteness,
        imageDescription: s.imageDescription,
        hook: s.hook,
        relations: s.relations,
        examples: s.examples,
        misuses: s.misuses.map((m) => m.text),
      })),
    })),
  };
}

/** Turns a review into failures, with the same field paths as the automatic checks. */
export function reviewFailures(word: GeneratedWord, review: Review): Failure[] {
  const failures: Failure[] = [];
  const add = (field: string, check: string, message: string) =>
    failures.push({ field, check, message });
  const shapeError = (field: string) =>
    add(field, "review-shape", "the reviewer's answer does not match the word; review by hand");

  if (review.lemmas.length !== word.lemmas.length) shapeError("lemmas");
  word.lemmas.forEach((l, li) => {
    const r = review.lemmas[li];
    if (!r) return;
    const lp = `lemmas.${li}`;
    for (const key of ["headword", "forms", "wordParts"] as const)
      if (!r[key].pass) add(`${lp}.${key}`, "reviewer", r[key].reason);
    if (r.senses.length !== l.senses.length) shapeError(`${lp}.senses`);
    l.senses.forEach((s, si) => {
      const rs = r.senses[si];
      if (!rs) return;
      const sp = `${lp}.senses.${si}`;
      for (const key of [
        "gloss",
        "definition",
        "labels",
        "imageDescription",
        "hook",
        "relations",
      ] as const)
        if (!rs[key].pass) add(`${sp}.${key}`, "reviewer", rs[key].reason);
      if (rs.examples.length !== s.examples.length) shapeError(`${sp}.examples`);
      s.examples.forEach((ex, ei) => {
        const re = rs.examples[ei];
        if (!re) return;
        const ep = `${sp}.examples.${ei}`;
        if (!re.sentence.pass) add(ep, "reviewer", re.sentence.reason);
        if (!re.translation.pass) add(`${ep}.translation`, "reviewer", re.translation.reason);
        // Only distractors that are really in the example count: the reviewer may echo
        // the surface form or a word it made up.
        const offered = new Set(ex.distractors.map((d) => d.toLocaleLowerCase("es")));
        const fit = re.distractorsThatFit.filter((d) => offered.has(d.toLocaleLowerCase("es")));
        if (fit.length > 0)
          add(`${ep}.distractors`, "distractor-fits", `also correct: ${fit.join(", ")}`);
      });
      if (rs.misuses.length !== s.misuses.length) shapeError(`${sp}.misuses`);
      s.misuses.forEach((_, mi) => {
        const rm = rs.misuses[mi];
        if (rm?.actuallyCorrect) add(`${sp}.misuses.${mi}`, "misuse-correct", rm.reason);
      });
    });
  });
  return failures;
}
