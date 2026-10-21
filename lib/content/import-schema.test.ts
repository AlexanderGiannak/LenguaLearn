import { describe, expect, it } from "vitest";
import { importPayloadSchema, type ImportPayloadInput } from "./import-schema";

// TEST FIXTURE: Spanish text below is test data, not content.
function validPayload(): ImportPayloadInput {
  return {
    lemmas: [
      {
        key: "casa#noun",
        headword: "casa",
        partOfSpeech: "noun",
        gender: "f",
        frequencyRank: 120,
        status: "ai_checked",
        senses: [
          {
            key: "casa#noun#1",
            gloss: "house",
            definition: "A building where people live.",
            frequencyRank: 120,
            register: "neutral",
            cognate: "none",
            concreteness: "concrete",
            status: "ai_checked",
            examples: [
              {
                text: "Mi casa es pequeña.",
                surfaceForm: "casa",
                start: 3,
                end: 7,
                translation: "My house is small.",
                distractors: ["mesa", "calle", "playa"],
                source: "ai",
              },
            ],
            images: [
              {
                fileKey: "fixtures/casa.svg",
                alt: "A small house with a red roof",
                source: "Original drawing",
                license: "MIT",
                attribution: "LenguaLearn",
              },
            ],
          },
        ],
      },
    ],
  };
}

type Lemma = ImportPayloadInput["lemmas"][number];
type Sense = Lemma["senses"][number];
type Example = NonNullable<Sense["examples"]>[number];

function lemma(p: ImportPayloadInput): Lemma {
  return p.lemmas[0]!;
}
function sense(p: ImportPayloadInput): Sense {
  return lemma(p).senses[0]!;
}
function example(p: ImportPayloadInput): Example {
  return sense(p).examples![0]!;
}

function issues(p: unknown): string[] {
  const result = importPayloadSchema.safeParse(p);
  if (result.success) return [];
  return result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
}

function expectInvalid(p: unknown, pathFragment: string) {
  const found = issues(p);
  expect(found.length, "expected the payload to be rejected").toBeGreaterThan(0);
  expect(found.join("\n")).toContain(pathFragment);
}

describe("importPayloadSchema", () => {
  it("accepts a valid payload and fills defaults", () => {
    const result = importPayloadSchema.parse(validPayload());
    const s = result.lemmas[0]!.senses[0]!;
    expect(s.hooks).toEqual([]);
    expect(s.relations).toEqual([]);
    expect(s.themes).toEqual([]);
    expect(result.lists).toEqual([]);
    expect(result.fixture).toBe(false);
  });

  describe("status", () => {
    it.each(["approved", "live", "retired"])("refuses to import as %s", (status) => {
      const p = validPayload();
      (sense(p) as { status: string }).status = status;
      expectInvalid(p, "status");
    });
  });

  describe("examples", () => {
    it("rejects offsets that do not point at the surface form", () => {
      const p = validPayload();
      example(p).start = 4;
      example(p).end = 8;
      expectInvalid(p, "surfaceForm");
    });

    it("rejects an end offset past the sentence", () => {
      const p = validPayload();
      example(p).end = 99;
      expectInvalid(p, "end");
    });

    it("rejects start >= end", () => {
      const p = validPayload();
      example(p).end = 3;
      expectInvalid(p, "end");
    });

    it.each([[["mesa", "calle"]], [["mesa", "calle", "playa", "perro"]]])(
      "requires exactly 3 distractors (%j)",
      (distractors) => {
        const p = validPayload();
        example(p).distractors = distractors;
        expectInvalid(p, "distractors");
      },
    );

    it("rejects a distractor equal to the surface form", () => {
      const p = validPayload();
      example(p).distractors = ["mesa", "Casa", "playa"];
      expectInvalid(p, "distractors");
    });

    it("rejects duplicate distractors", () => {
      const p = validPayload();
      example(p).distractors = ["mesa", "mesa", "playa"];
      expectInvalid(p, "distractors");
    });

    it("rejects sentences over 20 words", () => {
      const p = validPayload();
      const words = Array.from({ length: 20 }, () => "uno").join(" ");
      example(p).text = `Mi casa ${words}.`;
      expectInvalid(p, "text");
    });

    it("rejects text that is not NFC-normalized, since offsets would shift", () => {
      const p = validPayload();
      // "pequen" + combining tilde (U+0303): NFD form of "pequeña".
      example(p).text = "Mi casa es pequeña.";
      expectInvalid(p, "text");
    });
  });

  describe("senses", () => {
    it("rejects a gloss of 8 words or more", () => {
      const p = validPayload();
      sense(p).gloss = "one two three four five six seven eight";
      expectInvalid(p, "gloss");
    });

    it("accepts a 7-word gloss", () => {
      const p = validPayload();
      sense(p).gloss = "one two three four five six seven";
      expect(issues(p)).toEqual([]);
    });

    it("requires a region for a regional register", () => {
      const p = validPayload();
      sense(p).register = "regional";
      expectInvalid(p, "region");
    });

    it("rejects a region on a non-regional register", () => {
      const p = validPayload();
      sense(p).region = "Mexico";
      expectInvalid(p, "region");
    });

    it("requires the English word for a cognate or false friend", () => {
      const p = validPayload();
      sense(p).cognate = "false_friend";
      expectInvalid(p, "cognateEnglish");
    });

    it("rejects an English word when the sense is not a cognate", () => {
      const p = validPayload();
      sense(p).cognateEnglish = "case";
      expectInvalid(p, "cognateEnglish");
    });

    it("rejects images on abstract senses", () => {
      const p = validPayload();
      sense(p).concreteness = "abstract";
      expectInvalid(p, "images");
    });

    it("requires the sense key to extend its lemma key", () => {
      const p = validPayload();
      sense(p).key = "cosa#noun#1";
      expectInvalid(p, "key");
    });

    it("rejects a relation that points at its own sense", () => {
      const p = validPayload();
      sense(p).relations = [{ type: "synonym", text: "casa", targetKey: "casa#noun#1" }];
      expectInvalid(p, "targetKey");
    });

    it("rejects image file keys that try to leave the media folder", () => {
      const p = validPayload();
      sense(p).images![0]!.fileKey = "../secrets.txt";
      expectInvalid(p, "fileKey");
    });
  });

  describe("lemmas", () => {
    it("requires a gender on nouns", () => {
      const p = validPayload();
      delete lemma(p).gender;
      expectInvalid(p, "gender");
    });

    it("rejects a gender on verbs", () => {
      const p = validPayload();
      lemma(p).partOfSpeech = "verb";
      sense(p).concreteness = "abstract";
      delete sense(p).images;
      expectInvalid(p, "gender");
    });

    it("allows a feminine form only on adjectives", () => {
      const p = validPayload();
      lemma(p).feminine = "casa";
      expectInvalid(p, "feminine");
    });

    it("rejects a non-integer frequency rank", () => {
      const p = validPayload();
      lemma(p).frequencyRank = 1.5;
      expectInvalid(p, "frequencyRank");
    });
  });

  describe("whole payload", () => {
    it("rejects duplicate lemma keys", () => {
      const p = validPayload();
      p.lemmas.push(structuredClone(lemma(p)));
      expectInvalid(p, "key");
    });

    it("rejects duplicate sense keys", () => {
      const p = validPayload();
      lemma(p).senses.push(structuredClone(sense(p)));
      expectInvalid(p, "key");
    });

    it("rejects unknown fields, so a typo in a script does not silently drop data", () => {
      const p = validPayload() as Record<string, unknown>;
      (p.lemmas as Record<string, unknown>[])[0]!.frequency_rank = 120;
      expectInvalid(p, "frequency_rank");
    });

    it("rejects duplicate senses in a list", () => {
      const p = validPayload();
      p.lists = [
        {
          key: "level-1",
          name: "Level 1",
          status: "draft",
          senseKeys: ["casa#noun#1", "casa#noun#1"],
        },
      ];
      expectInvalid(p, "senseKeys");
    });
  });
});
