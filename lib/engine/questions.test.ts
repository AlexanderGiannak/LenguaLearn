import { describe, expect, it } from "vitest";
import { pickDistractors } from "./distractors.ts";
import {
  bandFor,
  buildQuestion,
  chooseQuestionType,
  QUESTION_TYPES,
  type QuestionType,
} from "./questions.ts";
import {
  casa,
  casita,
  caza,
  correr,
  estudiante,
  hogar,
  nounPool,
  verbPool,
} from "./test-fixtures.ts";
import { seededRng } from "./types.ts";

// TEST FIXTURE: Spanish words come from test-fixtures.ts.

const pool = [casa, casita, caza, hogar, correr, estudiante, ...nounPool, ...verbPool];

describe("bandFor", () => {
  it.each([
    [0, "low"],
    [1.99, "low"],
    [2, "mid"],
    [10, "mid"],
    [10.01, "high"],
    [400, "high"],
  ] as const)("stability %s days -> %s", (s, band) => {
    expect(bandFor(s)).toBe(band);
  });
});

describe("chooseQuestionType", () => {
  const ctx = { audio: true, contrastPartners: [] as number[] };

  it("tests recognition of a new word with a meaning question", () => {
    const seen = new Set<QuestionType>();
    for (let i = 0; i < 50; i++) {
      seen.add(
        chooseQuestionType({
          ...ctx,
          sense: casa,
          card: "recognition",
          stability: 0,
          lastType: null,
          rng: seededRng(i),
        }),
      );
    }
    expect(seen).toEqual(new Set(["meaning_choice", "listen_meaning_choice"]));
  });

  it("never offers listening questions without audio", () => {
    for (let i = 0; i < 50; i++) {
      const type = chooseQuestionType({
        ...ctx,
        audio: false,
        sense: casa,
        card: "recognition",
        stability: 0,
        lastType: null,
        rng: seededRng(i),
      });
      expect(QUESTION_TYPES[type].needsAudio).toBe(false);
    }
  });

  it("never repeats the last type for a sense when another fits", () => {
    for (let i = 0; i < 50; i++) {
      const type = chooseQuestionType({
        ...ctx,
        sense: casa,
        card: "recognition",
        stability: 0,
        lastType: "meaning_choice",
        rng: seededRng(i),
      });
      expect(type).toBe("listen_meaning_choice");
    }
  });

  it("starts a new production card with English-to-Spanish multiple choice", () => {
    const type = chooseQuestionType({
      ...ctx,
      sense: casa,
      card: "production",
      stability: 0,
      lastType: null,
      rng: seededRng(1),
    });
    expect(type).toBe("word_choice");
  });

  it("uses typed questions for strong production cards", () => {
    for (let i = 0; i < 30; i++) {
      const type = chooseQuestionType({
        ...ctx,
        sense: casa,
        card: "production",
        stability: 30,
        lastType: null,
        rng: seededRng(i),
      });
      expect(QUESTION_TYPES[type].mode).toBe("typed");
    }
  });

  it("asks gender questions only for nouns with one gender", () => {
    const types = (sense: typeof casa) =>
      new Set(
        Array.from({ length: 60 }, (_, i) =>
          chooseQuestionType({
            ...ctx,
            sense,
            card: "production",
            stability: 5,
            lastType: null,
            rng: seededRng(i),
          }),
        ),
      );
    expect(types(casa).has("gender_choice")).toBe(true);
    expect(types(estudiante).has("gender_choice")).toBe(false);
    expect(types(correr).has("gender_choice")).toBe(false);
  });

  it("falls back to an easier band when the band's types do not fit the word", () => {
    // No examples and no synonyms or antonyms: nothing in the 2-10 day recognition band fits.
    const type = chooseQuestionType({
      ...ctx,
      audio: false,
      sense: casita,
      card: "recognition",
      stability: 5,
      lastType: null,
      rng: seededRng(3),
    });
    expect(type).toBe("meaning_choice");
  });

  it("sometimes asks a contrast question once both confusable senses have production cards", () => {
    const types = Array.from({ length: 200 }, (_, i) =>
      chooseQuestionType({
        ...ctx,
        contrastPartners: [caza.id],
        sense: casa,
        card: "production",
        stability: 5,
        lastType: null,
        rng: seededRng(i),
      }),
    );
    expect(types).toContain("contrast_choice");
    expect(types.filter((t) => t === "contrast_choice").length).toBeLessThan(60);
  });
});

describe("pickDistractors", () => {
  it("never uses the word itself, a synonym, a family word or a commonly confused word", () => {
    for (let i = 0; i < 30; i++) {
      const ids = pickDistractors(casa, pool, seededRng(i)).map((s) => s.id);
      expect(ids).toHaveLength(3);
      expect(new Set(ids).size).toBe(3);
      for (const banned of [casa.id, casita.id, caza.id, hogar.id])
        expect(ids).not.toContain(banned);
    }
  });

  it("keeps to the same part of speech", () => {
    const picked = pickDistractors(correr, pool, seededRng(7));
    expect(picked.every((s) => s.partOfSpeech === "verb")).toBe(true);
  });

  it("prefers words at a similar level", () => {
    const target = { ...nounPool[0]!, id: 999, lemmaId: 999, level: 1 };
    for (let i = 0; i < 20; i++) {
      const levels = pickDistractors(target, nounPool, seededRng(i)).map((s) => s.level);
      expect(Math.max(...levels)).toBeLessThanOrEqual(3);
    }
  });

  it("does not use a word whose own relations point back at the target", () => {
    const ids = pickDistractors(caza, [casa, ...nounPool], seededRng(2)).map((s) => s.id);
    expect(ids).not.toContain(casa.id); // casa lists caza as commonly confused
  });
});

describe("buildQuestion", () => {
  const build = (type: QuestionType, sense = casa, seed = 1) =>
    buildQuestion({ type, sense, pool, rng: seededRng(seed) });

  it("meaning question: 4 English options, one of them right", () => {
    const q = build("meaning_choice");
    expect(q.card).toBe("recognition");
    expect(q.prompt).toMatchObject({ text: "la casa", lang: "es" });
    expect(q.options).toHaveLength(4);
    expect(q.options![q.correctIndex!]!.text).toBe("house");
    expect(new Set(q.options!.map((o) => o.text)).size).toBe(4);
  });

  it("word question: 4 Spanish options for an English prompt", () => {
    const q = build("word_choice");
    expect(q.card).toBe("production");
    expect(q.prompt).toMatchObject({ text: "house", lang: "en" });
    expect(q.options![q.correctIndex!]!.text).toBe("la casa");
    expect(q.options!.every((o) => o.lang === "es")).toBe(true);
  });

  it("cloze question uses the example's reviewed distractors", () => {
    const q = build("cloze_choice");
    expect(q.prompt).toMatchObject({ text: "Mi casa es pequeña.", gap: { start: 3, end: 7 } });
    expect(q.options!.map((o) => o.text).sort()).toEqual(["calle", "casa", "mesa", "playa"]);
    expect(q.note).toBeNull();
  });

  it("cloze without reviewed distractors falls back to dictionary forms with a note", () => {
    const noDistractors = { ...casa, examples: [casa.examples[1]!] };
    const q = build("cloze_choice", noDistractors);
    expect(q.note).toBe("The answer may be conjugated.");
    expect(q.options![q.correctIndex!]!.text).toBe("casa");
  });

  it("gender question asks for the article", () => {
    const q = build("gender_choice");
    expect(q.options!.map((o) => o.text)).toEqual(["el", "la"]);
    expect(q.options![q.correctIndex!]!.text).toBe("la");
  });

  it("usage question: three sentences, only one uses the word correctly", () => {
    const q = build("usage_choice");
    expect(q.options).toHaveLength(3);
    expect(q.options![q.correctIndex!]!.text).toBe(
      casa.examples[q.exampleId === casa.examples[0]!.id ? 0 : 1]!.text,
    );
    expect(q.options!.map((o) => o.text)).toEqual(expect.arrayContaining([...casa.misuses]));
  });

  it("asks usage questions only with at least two reviewed misuses", () => {
    const pick = (sense: typeof casa) =>
      new Set(
        Array.from({ length: 40 }, (_, i) =>
          chooseQuestionType({
            sense,
            card: "recognition",
            stability: 30,
            lastType: null,
            audio: false,
            contrastPartners: [],
            rng: seededRng(i),
          }),
        ),
      );
    expect(pick(casa).has("usage_choice")).toBe(true);
    expect(pick({ ...casa, misuses: ["Mi perro casa en el jardín."] }).has("usage_choice")).toBe(
      false,
    );
  });

  it("never picks a contrast question for a word without an example sentence", () => {
    for (let i = 0; i < 200; i++) {
      const type = chooseQuestionType({
        sense: { ...casa, examples: [] },
        card: "production",
        stability: 5,
        lastType: null,
        audio: true,
        contrastPartners: [caza.id],
        rng: seededRng(i),
      });
      expect(type).not.toBe("contrast_choice");
    }
  });

  it("typed cloze expects the surface form and knows the dictionary form", () => {
    const q = build("cloze_typed", correr);
    expect(q.expected).toBe("correr");
    expect(q.options).toBeNull();
    expect(q.mode).toBe("typed");
  });

  it("relation question offers a synonym as the right answer", () => {
    const q = build("relation_choice");
    expect(q.options![q.correctIndex!]!.text).toBe("el hogar");
  });

  it("contrast question reviews both senses", () => {
    const q = buildQuestion({
      type: "contrast_choice",
      sense: casa,
      pool,
      rng: seededRng(1),
      contrastPartnerId: caza.id,
    });
    expect(q.alsoReviews).toEqual([caza.id]);
    expect(q.options!.map((o) => o.text).sort()).toEqual(["casa", "caza"]);
  });
});
