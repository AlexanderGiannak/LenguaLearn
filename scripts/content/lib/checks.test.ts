import { describe, expect, it } from "vitest";
import { checkSense, locate, type Lexicon } from "./checks.ts";
import type { GeneratedSense } from "./generated.ts";

// TEST FIXTURES: the Spanish words and sentences below are test data, not content.

const forms: Record<string, string[]> = {
  casa: ["casa", "casar"],
  casas: ["casa", "casar"],
  mesa: ["mesa"],
  calle: ["calle"],
  playa: ["playa"],
  mi: ["mi"],
  es: ["ser"],
  grande: ["grande"],
  la: ["la"],
  de: ["de"],
  tu: ["tu"],
  vamos: ["ir"],
  a: ["a"],
  perro: ["perro"],
  vive: ["vivir"],
  en: ["en"],
  hoy: ["hoy"],
  mucho: ["mucho"],
  calor: ["calor"],
  enorme: ["enorme"],
  edificio: ["edificio"],
};
const lexicon: Lexicon = {
  formsOf: new Map(Object.entries(forms).map(([f, hs]) => [f, new Set(hs)])),
  isFunctionWord: (h) => ["mi", "la", "de", "tu", "a", "en"].includes(h),
};

function sense(examples: { text: string; surfaceForm: string; distractors?: string[] }[]) {
  const s: GeneratedSense = {
    gloss: "house",
    definition: "A building where people live.",
    register: "neutral",
    region: null,
    cognate: "none",
    cognateEnglish: null,
    concreteness: "concrete",
    imageDescription: null,
    themes: [],
    examples: examples.map((e) => ({
      translation: "-",
      distractors: ["mesa", "calle", "playa"],
      ...e,
    })),
    hook: null,
    relations: [],
    misuses: [
      { text: "Mi perro casa en la calle.", why: "-" },
      { text: "Hoy casa mucho calor.", why: "-" },
    ],
  };
  return s;
}

const four = [
  { text: "Mi casa es grande.", surfaceForm: "casa" },
  { text: "Vamos a tu casa.", surfaceForm: "casa" },
  { text: "La casa de mi perro.", surfaceForm: "casa" },
  { text: "Las casas son grandes.", surfaceForm: "casas" },
];

const run = (s: GeneratedSense, allowed?: Set<string>, seen = new Map<string, string>()) =>
  checkSense("casa", s, "lemmas.0.senses.0", lexicon, seen, allowed);

describe("locate", () => {
  it("finds the surface form as a whole word", () => {
    expect(locate("Mi casa es grande.", "casa")).toEqual({ start: 3, end: 7 });
  });

  it("ignores matches inside another word", () => {
    expect(locate("Las casas y la casa.", "casa")).toEqual({ start: 15, end: 19 });
  });

  it("refuses a missing or repeated form", () => {
    expect(locate("Mi hogar es grande.", "casa")).toEqual({
      error: '"casa" is not a word in the sentence',
    });
    // Case must match: the capitalized first word is not the surface form "casa".
    expect(locate("Casa con casa.", "casa")).toEqual({ start: 9, end: 13 });
    expect(locate("casa con casa.", "casa")).toEqual({ error: '"casa" appears 2 times' });
  });

  it("counts offsets in characters of NFC text", () => {
    expect(locate("¿Dónde está tu casa?", "casa")).toEqual({ start: 15, end: 19 });
  });
});

describe("checkSense", () => {
  it("passes a clean sense and gives every example its offsets", () => {
    const result = run(sense(four));
    expect(result.failures).toEqual([]);
    expect(result.examples.map((e) => [e.start, e.end])).toEqual([
      [3, 7],
      [11, 15],
      [3, 7],
      [4, 9],
    ]);
  });

  it("leaves out an example whose word is missing, with a failure", () => {
    const result = run(sense([...four.slice(0, 3), { text: "Mi hogar.", surfaceForm: "casa" }]));
    expect(result.examples).toHaveLength(3);
    expect(result.failures).toContainEqual(
      expect.objectContaining({ field: "lemmas.0.senses.0.examples.3", check: "offsets" }),
    );
  });

  it("flags a surface form that is not a form of the word", () => {
    const result = run(
      sense([...four.slice(0, 3), { text: "Mi mesa es grande.", surfaceForm: "mesa" }]),
    );
    expect(result.failures.map((f) => f.check)).toContain("inflection");
  });

  it("flags long sentences, wrong counts and duplicates across senses", () => {
    const long = `Mi casa ${Array.from({ length: 19 }, () => "grande").join(" ")}.`;
    const seen = new Map<string, string>();
    run(sense(four), undefined, seen);
    const result = run(sense([four[0]!, { text: long, surfaceForm: "casa" }]), undefined, seen);
    expect(result.failures.map((f) => f.check).sort()).toEqual(["count", "duplicate", "length"]);
  });

  it("flags distractors that repeat, are forms of the word, or are unknown", () => {
    const result = run(
      sense([
        { ...four[0]!, distractors: ["mesa", "mesa", "playa"] },
        { ...four[1]!, distractors: ["casas", "calle", "playa"] },
        { ...four[2]!, distractors: ["mesa", "calle", "zzz"] },
        four[3]!,
      ]),
    );
    expect(result.failures.map((f) => f.check)).toEqual(["distinct", "own-form", "unknown"]);
  });

  it("at limited levels, allows function words and one other word, not two", () => {
    const allowed = new Set(["casa", "ser", "grande", "perro", "ir"]);
    const ok = run(
      sense([...four.slice(0, 3), { text: "Mi casa es enorme.", surfaceForm: "casa" }]),
      allowed,
    );
    expect(ok.failures.map((f) => f.check)).not.toContain("vocabulary");

    const two = run(
      sense([...four.slice(0, 3), { text: "Mi casa es un edificio enorme.", surfaceForm: "casa" }]),
      allowed,
    );
    expect(two.failures).toContainEqual(
      expect.objectContaining({
        check: "vocabulary",
        message: expect.stringContaining("edificio"),
      }),
    );
  });

  it("allows names at limited levels, capitalized mid-sentence or unknown as words", () => {
    const allowed = new Set(["casa", "ser", "grande", "perro", "ir"]);
    const result = run(
      sense([
        ...four.slice(0, 2),
        { text: "La casa de Lucía y Andrés.", surfaceForm: "casa" },
        { text: "Sofía vive en la casa grande.", surfaceForm: "casa" },
      ]),
      allowed,
    );
    expect(result.failures.map((f) => f.check)).not.toContain("vocabulary");
  });

  it("flags a misuse sentence that does not use the word", () => {
    const s = sense(four);
    s.misuses[1] = { text: "Hoy hace calor.", why: "-" };
    expect(run(s).failures).toContainEqual(
      expect.objectContaining({ field: "lemmas.0.senses.0.misuses.1", check: "missing-word" }),
    );
  });
});
