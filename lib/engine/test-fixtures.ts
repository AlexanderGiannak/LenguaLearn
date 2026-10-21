import type { EngineExample, EngineSense } from "./types.ts";

// TEST FIXTURE: Spanish words below are test data for engine unit tests, not content.

let nextExampleId = 1000;
function example(text: string, surfaceForm: string, distractors: string[] = []): EngineExample {
  const start = text.indexOf(surfaceForm);
  if (start < 0) throw new Error(`fixture: "${surfaceForm}" not in "${text}"`);
  return {
    id: nextExampleId++,
    text,
    surfaceForm,
    start,
    end: start + surfaceForm.length,
    distractors,
  };
}

export function fixtureSense(over: Partial<EngineSense> & Pick<EngineSense, "id">): EngineSense {
  return {
    lemmaId: over.id,
    headword: `palabra${over.id}`,
    partOfSpeech: "noun",
    article: "la",
    gloss: `gloss ${over.id}`,
    frequencyRank: 100,
    level: 1,
    difficulty: null,
    cognate: "none",
    hasWordParts: false,
    synonymIds: [],
    antonymIds: [],
    familyIds: [],
    confusedIds: [],
    examples: [],
    ...over,
  };
}

export const casa = fixtureSense({
  id: 1,
  headword: "casa",
  gloss: "house",
  frequencyRank: 90,
  familyIds: [2],
  confusedIds: [3],
  synonymIds: [4],
  examples: [
    example("Mi casa es pequeña.", "casa", ["mesa", "calle", "playa"]),
    example("Vamos a tu casa.", "casa"),
  ],
});
export const casita = fixtureSense({ id: 2, headword: "casita", gloss: "little house" });
export const caza = fixtureSense({ id: 3, headword: "caza", gloss: "hunt" });
export const hogar = fixtureSense({
  id: 4,
  headword: "hogar",
  gloss: "home",
  article: "el",
  synonymIds: [1],
});
export const correr = fixtureSense({
  id: 5,
  headword: "correr",
  partOfSpeech: "verb",
  article: null,
  gloss: "to run",
  examples: [example("Me gusta correr por la mañana.", "correr", ["comer", "leer", "dormir"])],
});
export const estudiante = fixtureSense({
  id: 6,
  headword: "estudiante",
  gloss: "student",
  article: "el/la",
});

/** Unrelated nouns at a spread of levels, for distractor choice. */
export const nounPool: EngineSense[] = Array.from({ length: 40 }, (_, i) =>
  fixtureSense({
    id: 100 + i,
    headword: `sustantivo${i}`,
    gloss: i % 2 ? `thing ${i}` : `a much longer gloss ${i}`,
    level: 1 + (i % 10),
    frequencyRank: 1 + (i % 10) * 500,
    examples: [example(`Veo el sustantivo${i} aquí.`, `sustantivo${i}`)],
  }),
);
export const verbPool: EngineSense[] = Array.from({ length: 10 }, (_, i) =>
  fixtureSense({
    id: 200 + i,
    headword: `verbo${i}`,
    partOfSpeech: "verb",
    article: null,
    gloss: `to do ${i}`,
    level: 1,
  }),
);
