import { describe, expect, it } from "vitest";
import { checkTypedAnswer, type AnswerCheckInput, type AnswerCheckResult } from "./answer-check.ts";

// TEST FIXTURE: Spanish words below are test data, not content.

// Words the "bank" knows, for the meaning-changing accent and typo rules.
const BANK = new Set(["esta", "está", "papa", "papá", "pecado", "pesado", "logro", "logró"]);
const isOtherWord = (form: string) => BANK.has(form);

const base: Omit<AnswerCheckInput, "typed" | "expected"> = {
  mode: "word",
  article: null,
  productionStabilityDays: 5,
  learned: false,
  isOtherWord,
};

type Case = [
  label: string,
  input: Partial<AnswerCheckInput> & Pick<AnswerCheckInput, "typed" | "expected">,
  expected: Pick<AnswerCheckResult, "grade" | "reason"> & { note?: string | null },
];

const cases: Case[] = [
  // Normalizing
  [
    "exact",
    { typed: "difícil", expected: "difícil" },
    { grade: "correct", reason: "exact", note: null },
  ],
  ["upper case", { typed: "DIFÍCIL", expected: "difícil" }, { grade: "correct", reason: "exact" }],
  [
    "surrounding spaces",
    { typed: "  difícil ", expected: "difícil" },
    { grade: "correct", reason: "exact" },
  ],
  [
    "inner spaces collapse",
    { typed: "darse   cuenta", expected: "darse cuenta" },
    { grade: "correct", reason: "exact" },
  ],
  [
    "surrounding punctuation",
    { typed: "¡difícil!", expected: "difícil" },
    { grade: "correct", reason: "exact" },
  ],
  [
    "decomposed accent (NFD input)",
    { typed: "difícil", expected: "difícil" },
    { grade: "correct", reason: "exact" },
  ],
  ["empty", { typed: "", expected: "difícil" }, { grade: "wrong", reason: "empty" }],
  ["only spaces", { typed: "   ", expected: "difícil" }, { grade: "wrong", reason: "empty" }],
  ["different word", { typed: "fácil", expected: "difícil" }, { grade: "wrong", reason: "wrong" }],

  // Accents grow stricter with production strength
  [
    "missing accent, weak card",
    { typed: "dificil", expected: "difícil", productionStabilityDays: 5 },
    { grade: "correct", reason: "accent_ignored", note: "Watch the accent: difícil" },
  ],
  [
    "missing accent, just under 21 days",
    { typed: "dificil", expected: "difícil", productionStabilityDays: 20.9 },
    { grade: "correct", reason: "accent_ignored" },
  ],
  [
    "missing accent at 21 days",
    { typed: "dificil", expected: "difícil", productionStabilityDays: 21 },
    { grade: "hard", reason: "accent", note: "Watch the accent: difícil" },
  ],
  [
    "misplaced accent, strong card",
    { typed: "díficil", expected: "difícil", productionStabilityDays: 30 },
    { grade: "hard", reason: "accent" },
  ],
  [
    "extra accent, strong card",
    { typed: "cása", expected: "casa", productionStabilityDays: 30 },
    { grade: "hard", reason: "accent" },
  ],
  [
    "meaning-changing accent, not yet learned",
    { typed: "esta", expected: "está", productionStabilityDays: 30 },
    { grade: "hard", reason: "accent" },
  ],
  [
    "meaning-changing accent, learned",
    { typed: "esta", expected: "está", productionStabilityDays: 30, learned: true },
    {
      grade: "wrong",
      reason: "accent_meaning",
      note: "The accent changes the meaning: está, not esta",
    },
  ],
  [
    "papa for papá, learned",
    { typed: "papa", expected: "papá", productionStabilityDays: 40, learned: true },
    { grade: "wrong", reason: "accent_meaning" },
  ],
  [
    "added accent makes another word, learned",
    { typed: "papá", expected: "papa", productionStabilityDays: 40, learned: true },
    { grade: "wrong", reason: "accent_meaning" },
  ],
  [
    "meaning-changing accent, learned but weak production",
    { typed: "papa", expected: "papá", productionStabilityDays: 5, learned: true },
    { grade: "wrong", reason: "accent_meaning" },
  ],
  [
    "learned, accent that changes nothing",
    { typed: "dificil", expected: "difícil", productionStabilityDays: 40, learned: true },
    { grade: "hard", reason: "accent" },
  ],
  [
    "dieresis counts as an accent",
    { typed: "pinguino", expected: "pingüino", productionStabilityDays: 5 },
    { grade: "correct", reason: "accent_ignored" },
  ],

  // ñ is a different letter
  [
    "missing ñ, short word",
    { typed: "ano", expected: "año" },
    { grade: "wrong", reason: "enye", note: "ñ is a different letter: año" },
  ],
  [
    "missing ñ, long word (not a typo)",
    { typed: "senora", expected: "señora" },
    { grade: "wrong", reason: "enye" },
  ],
  [
    "missing ñ and accent",
    { typed: "manana", expected: "mañana", productionStabilityDays: 30 },
    { grade: "wrong", reason: "enye" },
  ],

  // One typo in a long word is "Almost"
  [
    "typo: substitution",
    { typed: "dinaro", expected: "dinero" },
    { grade: "hard", reason: "typo", note: "Almost: dinero" },
  ],
  [
    "typo: swapped letters",
    { typed: "dinreo", expected: "dinero" },
    { grade: "hard", reason: "typo" },
  ],
  [
    "typo: missing letter",
    { typed: "dinro", expected: "dinero" },
    { grade: "hard", reason: "typo" },
  ],
  [
    "typo: extra letter",
    { typed: "dineero", expected: "dinero" },
    { grade: "hard", reason: "typo" },
  ],
  [
    "typo plus missing accent",
    { typed: "dificl", expected: "difícil" },
    { grade: "hard", reason: "typo" },
  ],
  [
    "typo in a 4-letter word",
    { typed: "csa", expected: "casa" },
    { grade: "wrong", reason: "wrong" },
  ],
  [
    "typo in a 5-letter word",
    { typed: "lipro", expected: "libro" },
    { grade: "wrong", reason: "wrong" },
  ],
  ["two typos", { typed: "dinaso", expected: "dinero" }, { grade: "wrong", reason: "wrong" }],
  [
    "typo that spells another bank word",
    { typed: "pecado", expected: "pesado" },
    { grade: "wrong", reason: "wrong" },
  ],

  // Articles: optional, but a wrong one is a gender mistake
  [
    "right article",
    { typed: "la casa", expected: "casa", article: "la" },
    { grade: "correct", reason: "exact" },
  ],
  [
    "no article",
    { typed: "casa", expected: "casa", article: "la" },
    { grade: "correct", reason: "exact" },
  ],
  [
    "indefinite article",
    { typed: "una casa", expected: "casa", article: "la" },
    { grade: "correct", reason: "exact" },
  ],
  [
    "wrong article",
    { typed: "el casa", expected: "casa", article: "la" },
    { grade: "hard", reason: "article", note: "Right word, it's la casa." },
  ],
  [
    "wrong indefinite article",
    { typed: "un casa", expected: "casa", article: "la" },
    { grade: "hard", reason: "article" },
  ],
  [
    "common gender takes either article",
    { typed: "el estudiante", expected: "estudiante", article: "el/la" },
    { grade: "correct", reason: "exact" },
  ],
  [
    "common gender, la",
    { typed: "la estudiante", expected: "estudiante", article: "el/la" },
    { grade: "correct", reason: "exact" },
  ],
  [
    "feminine noun that takes el",
    { typed: "el agua", expected: "agua", article: "el" },
    { grade: "correct", reason: "exact" },
  ],
  [
    "la agua is a gender mistake",
    { typed: "la agua", expected: "agua", article: "el" },
    { grade: "hard", reason: "article", note: "Right word, it's el agua." },
  ],
  [
    "wrong article and missing accent",
    { typed: "el cancion", expected: "canción", article: "la" },
    { grade: "hard", reason: "article" },
  ],
  [
    "right article, wrong word",
    { typed: "la mesa", expected: "casa", article: "la" },
    { grade: "wrong", reason: "wrong" },
  ],
  [
    "article on a word that is not a noun",
    { typed: "el tener", expected: "tener", article: null },
    { grade: "wrong", reason: "wrong" },
  ],

  // Typed cloze
  [
    "cloze exact",
    { typed: "logró", expected: "logró", mode: "cloze", dictionaryForm: "lograr" },
    { grade: "correct", reason: "exact" },
  ],
  [
    "cloze dictionary form",
    { typed: "lograr", expected: "logró", mode: "cloze", dictionaryForm: "lograr" },
    { grade: "hard", reason: "form", note: "Right word, wrong form: logró" },
  ],
  [
    "cloze reflexive dictionary form",
    { typed: "quejarse", expected: "queja", mode: "cloze", dictionaryForm: "quejarse" },
    { grade: "hard", reason: "form" },
  ],
  [
    "cloze missing accent, weak card",
    { typed: "logro", expected: "logró", mode: "cloze", dictionaryForm: "lograr" },
    { grade: "correct", reason: "accent_ignored" },
  ],
  [
    "cloze other conjugation",
    { typed: "logré", expected: "logró", mode: "cloze", dictionaryForm: "lograr" },
    { grade: "wrong", reason: "wrong" },
  ],
  [
    "cloze does not strip articles",
    { typed: "la casa", expected: "casa", mode: "cloze", article: "la" },
    { grade: "wrong", reason: "wrong" },
  ],
];

describe("checkTypedAnswer", () => {
  it("has at least 40 cases", () => {
    expect(cases.length).toBeGreaterThanOrEqual(40);
  });

  it.each(cases)("%s", (_label, input, expected) => {
    const result = checkTypedAnswer({ ...base, ...input });
    expect(result).toMatchObject(expected);
  });

  it("always returns the correct spelling to show", () => {
    expect(checkTypedAnswer({ ...base, typed: "fácil", expected: "Difícil" }).correctAnswer).toBe(
      "Difícil",
    );
    expect(
      checkTypedAnswer({ ...base, typed: "el casa", expected: "casa", article: "la" })
        .correctAnswer,
    ).toBe("la casa");
  });
});
