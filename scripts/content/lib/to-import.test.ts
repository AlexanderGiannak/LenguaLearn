import { describe, expect, it } from "vitest";
import { lemmaKey, toImportLemmas, type CheckedWord } from "./to-import.ts";

// TEST FIXTURES: the Spanish words and sentences below are test data, not content.

function word(
  overrides: {
    reviewed?: boolean;
    failures?: CheckedWord["lemmas"][0]["senses"][0]["failures"];
  } = {},
): CheckedWord {
  return {
    candidate: { rank: 120, lemma: "casa", level: 1 },
    checkedAt: "2026-11-25T00:00:00Z",
    reviewed: overrides.reviewed ?? true,
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
            hook: { kind: "mnemonic", text: "A house is a casa." },
            relations: [{ type: "family", text: "casita" }],
            examples: [
              {
                text: "Mi casa es grande.",
                surfaceForm: "casa",
                start: 3,
                end: 7,
                translation: "My house is big.",
                distractors: ["mesa", "calle", "nube"],
              },
              {
                text: "Tu casa es bonita.",
                surfaceForm: "casa",
                start: 3,
                end: 7,
                translation: "Your house is pretty.",
                distractors: ["mesa", "mesa", "nube"],
              },
            ],
            misuses: [{ text: "Hoy casa mucho calor.", why: "Confused with hacer." }],
            failures: overrides.failures ?? [],
            reviewerGloss: "house, home",
          },
        ],
      },
    ],
  };
}

describe("lemmaKey", () => {
  it("lowercases and joins words with underscores", () => {
    expect(lemmaKey("Por favor", "phrase")).toBe("por_favor#phrase");
    expect(lemmaKey("qué", "determiner")).toBe("qué#determiner");
  });
});

describe("toImportLemmas", () => {
  it("makes a clean, reviewed sense ai_checked with its check notes", () => {
    const { lemmas, refused } = toImportLemmas(word());
    expect(refused).toEqual([]);
    const [lemma] = lemmas;
    expect(lemma).toMatchObject({ key: "casa#noun", gender: "f", status: "ai_checked" });
    expect(lemma!.senses[0]).toMatchObject({
      key: "casa#noun#1",
      frequencyRank: 120,
      status: "ai_checked",
      imageDescription: "A small house with a red roof.",
      checkNotes: { reviewerGloss: "house, home", failures: [] },
      hooks: [{ kind: "mnemonic", text: "A house is a casa.", source: "ai" }],
      misuses: [
        { text: "Hoy casa mucho calor.", explanation: "Confused with hacer.", source: "ai" },
      ],
    });
  });

  it("sends a sense with failures, or without a review, to the queue as draft", () => {
    const failure = { field: "lemmas.0.senses.0.gloss", check: "reviewer", message: "Vague." };
    const failed = toImportLemmas(word({ failures: [failure] })).lemmas[0]!;
    expect(failed.status).toBe("draft");
    expect(failed.senses[0]).toMatchObject({
      status: "draft",
      checkNotes: { failures: [failure] },
    });

    const unreviewed = toImportLemmas(word({ reviewed: false })).lemmas[0]!.senses[0]!;
    expect(unreviewed.status).toBe("draft");
    expect(unreviewed.checkNotes!.failures.map((f) => f.check)).toEqual(["not-reviewed"]);
  });

  it("leaves out an example the import would refuse, keeping the rest", () => {
    const sense = toImportLemmas(word()).lemmas[0]!.senses[0]!;
    expect(sense.examples!.map((e) => e.text)).toEqual(["Mi casa es grande."]);
  });

  it("refuses a lemma the import schema rejects, saying why", () => {
    const w = word();
    w.lemmas[0]!.senses[0]!.gloss = "a building where a family lives and sleeps";
    const { lemmas, refused } = toImportLemmas(w);
    expect(lemmas).toEqual([]);
    expect(refused[0]!.key).toBe("casa#noun");
    expect(refused[0]!.problems.join()).toMatch(/gloss/);
  });

  it("drops fields that do not apply to the part of speech", () => {
    const w = word();
    Object.assign(w.lemmas[0]!, { partOfSpeech: "verb", headword: "casar", gender: "f" });
    const lemma = toImportLemmas(w).lemmas[0]!;
    expect(lemma.key).toBe("casar#verb");
    expect(lemma.gender).toBeUndefined();
  });
});
