import { ENGINE_CONFIG } from "./config.ts";

// Grades a typed answer (spec: Answer checking for typed answers). Every rule lives in this
// one function; answer-check.test.ts holds the table of cases.
//
// Order of checks: exact match, then accents, then ñ, then the cloze dictionary form, then
// a single typo. A wrong article on an otherwise right noun is a gender mistake (Hard).

export type AnswerCheckInput = {
  typed: string;
  /** The answer as displayed: the headword, or the surface form in a cloze sentence. */
  expected: string;
  /** "word": type the word from its meaning. "cloze": type the missing word in a sentence. */
  mode: "word" | "cloze";
  /** The noun's article in word mode ("el/la" for common-gender nouns); null otherwise. */
  article: "el" | "la" | "el/la" | null;
  /** The lemma's dictionary form, for "right word, wrong form" in cloze mode. */
  dictionaryForm?: string;
  productionStabilityDays: number;
  learned: boolean;
  /** True if this normalized form is a different word in the bank (papa vs papá). */
  isOtherWord: (form: string) => boolean;
};

export type AnswerGrade = "correct" | "hard" | "wrong";
export type AnswerReason =
  | "exact"
  | "accent_ignored"
  | "accent"
  | "accent_meaning"
  | "enye"
  | "form"
  | "typo"
  | "article"
  | "wrong"
  | "empty";

export type AnswerCheckResult = {
  grade: AnswerGrade;
  reason: AnswerReason;
  /** One line for the feedback screen, or null. */
  note: string | null;
  /** The same line in parts, with the Spanish words marked so screens can set lang="es". */
  noteParts: NotePart[] | null;
  /** The correct spelling, always shown. */
  correctAnswer: string;
};

const ARTICLES: Record<"el" | "la" | "el/la", readonly string[]> = {
  el: ["el", "un"],
  la: ["la", "una"],
  "el/la": ["el", "la", "un", "una"],
};
const ANY_ARTICLE = new Set(["el", "la", "un", "una"]);

export type NotePart = { text: string; lang?: "es" };
type Note = { text: string; parts: NotePart[] };

/** Builds a note from English text and Spanish words (wrapped in es()). */
function note(...segments: (string | NotePart)[]): Note {
  const parts = segments.map((s) => (typeof s === "string" ? { text: s } : s));
  return { text: parts.map((p) => p.text).join(""), parts };
}
const es = (text: string): NotePart => ({ text, lang: "es" });

export function normalizeAnswer(s: string): string {
  return s
    .normalize("NFC")
    .toLocaleLowerCase("es")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[¿¡"'.,;:!?\s]+|[¿¡"'.,;:!?\s]+$/g, "");
}

/** Removes acute accents and the dieresis but keeps ñ, which is its own letter. */
function foldAccents(s: string): string {
  return s.normalize("NFD").replace(/ñ/g, "ñ").replace(/[́̈]/g, "").normalize("NFC");
}

function foldEnye(s: string): string {
  return foldAccents(s).replace(/ñ/g, "n");
}

function letterCount(s: string): number {
  return (s.match(/\p{L}/gu) ?? []).length;
}

/** Edit distance counting insertions, deletions, substitutions and adjacent swaps. */
export function editDistance(a: string, b: string): number {
  const x = [...a];
  const y = [...b];
  const d: number[][] = Array.from({ length: x.length + 1 }, (_, i) =>
    Array.from({ length: y.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= x.length; i++) {
    for (let j = 1; j <= y.length; j++) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1;
      let best = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && x[i - 1] === y[j - 2] && x[i - 2] === y[j - 1]) {
        best = Math.min(best, d[i - 2]![j - 2]! + 1);
      }
      d[i]![j] = best;
    }
  }
  return d[x.length]![y.length]!;
}

export function checkTypedAnswer(input: AnswerCheckInput): AnswerCheckResult {
  const { expected, article, mode } = input;
  const correctAnswer = mode === "word" && article ? `${article} ${expected}` : expected;
  const result = (grade: AnswerGrade, reason: AnswerReason, n: Note | null = null) => ({
    grade,
    reason,
    note: n?.text ?? null,
    noteParts: n?.parts ?? null,
    correctAnswer,
  });

  let body = normalizeAnswer(input.typed);
  if (body === "") return result("wrong", "empty");

  // Articles are optional for nouns in word mode. Remember a wrong one.
  let wrongArticle = false;
  if (mode === "word" && article) {
    const [first, ...rest] = body.split(" ");
    if (first && rest.length > 0 && ANY_ARTICLE.has(first)) {
      wrongArticle = !ARTICLES[article].includes(first);
      body = rest.join(" ");
    }
  }
  const genderNote = note("Right word, it's ", es(correctAnswer), ".");
  // A right word with the wrong article is Hard whatever else was right about it.
  const rightWord = (grade: AnswerGrade, reason: AnswerReason, n: Note | null = null) =>
    wrongArticle ? result("hard", "article", genderNote) : result(grade, reason, n);

  const target = normalizeAnswer(expected);
  if (body === target) return rightWord("correct", "exact");

  // Same letters, different accents.
  if (foldAccents(body) === foldAccents(target)) {
    const { accentHardFromDays } = ENGINE_CONFIG.answerCheck;
    if (input.learned && input.isOtherWord(body)) {
      return result(
        "wrong",
        "accent_meaning",
        note("The accent changes the meaning: ", es(expected), ", not ", es(body)),
      );
    }
    const accentNote = note("Watch the accent: ", es(expected));
    return input.productionStabilityDays < accentHardFromDays
      ? rightWord("correct", "accent_ignored", accentNote)
      : rightWord("hard", "accent", accentNote);
  }

  // n for ñ changes the word (año, ano), so it is never a typo or an accent slip.
  if (foldEnye(body) === foldEnye(target)) {
    return result("wrong", "enye", note(es("ñ"), " is a different letter: ", es(expected)));
  }

  if (
    mode === "cloze" &&
    input.dictionaryForm &&
    foldAccents(body) === foldAccents(normalizeAnswer(input.dictionaryForm))
  ) {
    return result("hard", "form", note("Right word, wrong form: ", es(expected)));
  }

  if (
    letterCount(target) >= ENGINE_CONFIG.answerCheck.typoMinLength &&
    editDistance(foldAccents(body), foldAccents(target)) === 1 &&
    !input.isOtherWord(body)
  ) {
    return rightWord("hard", "typo", note("Almost: ", es(expected)));
  }

  return result("wrong", "wrong");
}
