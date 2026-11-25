import { describe, expect, it } from "vitest";
import type { GeneratedWord } from "./generated.ts";
import { reviewFailures, reviewInput, type Review } from "./review.ts";

// TEST FIXTURES: the Spanish words and sentences below are test data, not content.

const ok = { pass: true, reason: "" };

const word: GeneratedWord = {
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
          imageDescription: "A small house with a red roof.",
          themes: ["home"],
          hook: null,
          relations: [],
          examples: [
            {
              text: "Mi casa es grande.",
              surfaceForm: "casa",
              translation: "My house is big.",
              distractors: ["mesa", "calle", "nube"],
            },
          ],
          misuses: [{ text: "Hoy casa mucho calor.", why: "Confused with hacer." }],
        },
      ],
    },
  ],
};

function review(overrides: Partial<Review["lemmas"][number]["senses"][number]> = {}): Review {
  return {
    lemmas: [
      {
        headword: ok,
        forms: ok,
        wordParts: ok,
        senses: [
          {
            ownGloss: "house, home",
            gloss: ok,
            definition: ok,
            labels: ok,
            imageDescription: ok,
            hook: ok,
            relations: ok,
            examples: [{ sentence: ok, translation: ok, distractorsThatFit: [] }],
            misuses: [{ actuallyCorrect: false, reason: "" }],
            ...overrides,
          },
        ],
      },
    ],
  };
}

describe("reviewInput", () => {
  it("sends the content but not the misuse explanations or themes", () => {
    const input = reviewInput(word, { lemma: "casa", level: 1 });
    const sense = input.lemmas[0]!.senses[0]!;
    expect(sense.misuses).toEqual(["Hoy casa mucho calor."]);
    expect(sense).not.toHaveProperty("themes");
  });
});

describe("reviewFailures", () => {
  it("finds nothing in a clean review", () => {
    expect(reviewFailures(word, review())).toEqual([]);
  });

  it("turns failed verdicts into failures with field paths", () => {
    const failures = reviewFailures(
      word,
      review({
        gloss: { pass: false, reason: "Too narrow." },
        examples: [
          {
            sentence: ok,
            translation: { pass: false, reason: "Should be 'home'." },
            distractorsThatFit: [],
          },
        ],
      }),
    );
    expect(failures).toEqual([
      { field: "lemmas.0.senses.0.gloss", check: "reviewer", message: "Too narrow." },
      {
        field: "lemmas.0.senses.0.examples.0.translation",
        check: "reviewer",
        message: "Should be 'home'.",
      },
    ]);
  });

  it("flags distractors that fit, ignoring words that are not distractors", () => {
    const failures = reviewFailures(
      word,
      review({
        examples: [{ sentence: ok, translation: ok, distractorsThatFit: ["Calle", "casa", "x"] }],
      }),
    );
    expect(failures).toEqual([
      {
        field: "lemmas.0.senses.0.examples.0.distractors",
        check: "distractor-fits",
        message: "also correct: Calle",
      },
    ]);
  });

  it("flags misuses the reviewer finds correct", () => {
    const failures = reviewFailures(
      word,
      review({ misuses: [{ actuallyCorrect: true, reason: "Fine in context." }] }),
    );
    expect(failures.map((f) => f.check)).toEqual(["misuse-correct"]);
  });

  it("flags every sense the reviewer left out, so none can pass unreviewed", () => {
    const twoSenses: GeneratedWord = structuredClone(word);
    twoSenses.lemmas[0]!.senses.push(structuredClone(twoSenses.lemmas[0]!.senses[0]!));
    const failures = reviewFailures(twoSenses, review());
    expect(failures.map((f) => f.field)).toEqual(["lemmas.0.senses", "lemmas.0.senses.1"]);

    const noLemma = reviewFailures(word, { lemmas: [] });
    expect(noLemma.map((f) => f.field)).toEqual(["lemmas", "lemmas.0.senses.0"]);
  });

  it("sends a review whose shape does not match the word to a person", () => {
    const failures = reviewFailures(word, review({ examples: [] }));
    expect(failures.map((f) => f.check)).toEqual(["review-shape"]);
  });
});
