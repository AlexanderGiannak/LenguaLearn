import { describe, expect, it } from "vitest";
import { shapeProblems, type GeneratedWord } from "./generated.ts";

// TEST FIXTURES: the Spanish words and sentences below are test data, not content.
const example = {
  text: "Mi casa es grande.",
  surfaceForm: "casa",
  translation: "My house is big.",
  distractors: ["mesa", "calle", "nube"],
};

function word(examples = 4, misuses = 2): GeneratedWord {
  return {
    skipReason: null,
    lemmas: [
      {
        headword: "casa",
        partOfSpeech: "noun",
        gender: "f",
        articleOverride: null,
        plural: null,
        feminine: null,
        formsNote: null,
        wordParts: [],
        laterSenses: [],
        senses: [
          {
            gloss: "house",
            definition: "A building where people live.",
            register: "neutral",
            region: null,
            cognate: "none",
            cognateEnglish: null,
            concreteness: "concrete",
            imageDescription: null,
            themes: [],
            hook: null,
            relations: [],
            examples: Array.from({ length: examples }, () => example),
            misuses: Array.from({ length: misuses }, () => ({ text: "Hoy casa calor.", why: "-" })),
          },
        ],
      },
    ],
  };
}

describe("shapeProblems", () => {
  it("accepts a complete answer and a skip", () => {
    expect(shapeProblems(word())).toEqual([]);
    expect(shapeProblems({ skipReason: "A name.", lemmas: [] })).toEqual([]);
  });

  it("refuses too few examples, misuses or distractors, so the word is asked again", () => {
    expect(shapeProblems(word(3, 1))).toEqual([
      "lemma 1 sense 1 has 3 examples, not 4",
      "lemma 1 sense 1 has 1 misuses, not 2",
    ]);
    const w = word();
    w.lemmas[0]!.senses[0]!.examples[1] = { ...example, distractors: ["mesa"] };
    expect(shapeProblems(w)).toEqual(["lemma 1 sense 1 example 2 has 1 distractors"]);
  });

  it("refuses an empty answer that does not say why", () => {
    expect(shapeProblems({ skipReason: null, lemmas: [] })).toEqual([
      "no lemmas and no skip reason",
    ]);
  });
});
