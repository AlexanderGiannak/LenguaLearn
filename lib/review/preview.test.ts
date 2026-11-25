import { describe, expect, it } from "vitest";
import type { EngineSense } from "@/lib/engine/types";
import { previewQuestions } from "./preview";

// TEST FIXTURES: the Spanish words below are test data, not content.

const sense = (over: Partial<EngineSense> & { id: number }): EngineSense => ({
  lemmaId: over.id,
  headword: `w${over.id}`,
  partOfSpeech: "noun",
  article: "el",
  gloss: `gloss ${over.id}`,
  frequencyRank: over.id,
  level: 1,
  difficulty: null,
  cognate: "none",
  hasWordParts: false,
  synonymIds: [],
  antonymIds: [],
  familyIds: [],
  confusedIds: [],
  examples: [],
  misuses: [],
  ...over,
});

const perro = sense({
  id: 1,
  headword: "perro",
  gloss: "dog",
  synonymIds: [5],
  examples: [
    {
      id: 10,
      text: "El perro duerme.",
      surfaceForm: "perro",
      start: 3,
      end: 8,
      distractors: ["gato", "libro", "río"],
    },
    {
      id: 11,
      text: "Mi perro come.",
      surfaceForm: "perro",
      start: 3,
      end: 8,
      distractors: ["pan", "sol", "mar"],
    },
  ],
  misuses: ["Perro el duerme.", "El perro duermes."],
});
const pool = [2, 3, 4, 5].map((id) => sense({ id }));

describe("previewQuestions", () => {
  const qs = previewQuestions(perro, pool);

  it("asks a gap question for every sentence with that sentence's own wrong choices", () => {
    const gaps = qs.filter((q) => q.question.type === "cloze_choice");
    expect(gaps.map((q) => q.question.prompt.text)).toEqual(["El perro duerme.", "Mi perro come."]);
    const options = gaps[0]!.question.options!.map((o) => o.text);
    expect(options.sort()).toEqual(["gato", "libro", "perro", "río"]);
    expect(gaps[0]!.question.options![gaps[0]!.question.correctIndex!]!.text).toBe("perro");
  });

  it("includes each kind that fits the sense", () => {
    expect(qs.map((q) => q.question.type)).toEqual([
      "meaning_choice",
      "word_choice",
      "gender_choice",
      "cloze_choice",
      "cloze_choice",
      "usage_choice",
      "relation_choice",
      "cloze_typed",
    ]);
  });

  it("leaves out kinds that do not fit, and never uses the sense as its own wrong choice", () => {
    const bare = sense({ id: 9, article: null, partOfSpeech: "verb" });
    const kinds = previewQuestions(bare, [bare, ...pool]).map((q) => q.question.type);
    expect(kinds).toEqual(["meaning_choice", "word_choice"]);
    const meaning = previewQuestions(bare, [bare, ...pool])[0]!.question;
    expect(meaning.options!.filter((o) => o.senseId === 9)).toHaveLength(1);
  });

  it("shows the same options on every visit", () => {
    expect(previewQuestions(perro, pool)).toEqual(qs);
  });
});
