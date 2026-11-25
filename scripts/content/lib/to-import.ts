// Turns one checked word (content/checked/) into lemmas for the admin import endpoint
// (spec: step 3, "a sense that passes everything moves to ai_checked; anything else goes to
// the review queue with the failures listed"). Each lemma is validated with the app's own
// import schema, so a word that would be refused never reaches the upload.
import {
  countWords,
  importPayloadSchema,
  MAX_SENTENCE_WORDS,
  type CheckNotes,
  type ImportPayloadInput,
} from "../../../lib/content/import-schema.ts";
import type { CheckedExample, Failure } from "./checks.ts";
import type { GeneratedLemma, GeneratedSense } from "./generated.ts";

type LemmaInput = ImportPayloadInput["lemmas"][number];

export type CheckedSense = Omit<GeneratedSense, "examples"> & {
  examples: CheckedExample[];
  failures: Failure[];
  reviewerGloss: string | null;
};

/** One file in content/checked/. */
export type CheckedWord = {
  candidate: { rank: number; lemma: string; level: number };
  checkedAt: string;
  reviewed: boolean;
  /** Set when the generator decided the candidate is not worth a card. */
  skipReason?: string | null;
  failures?: Failure[];
  lemmas: (Omit<GeneratedLemma, "senses"> & { senses: CheckedSense[] })[];
};

/** A stable key from a headword: lowercase, spaces as underscores ("por favor#phrase"). */
export function lemmaKey(headword: string, pos: string): string {
  return `${headword.normalize("NFC").toLocaleLowerCase("es").trim().replace(/\s+/g, "_")}#${pos}`;
}

/** The import schema's example rules that the checks only report. */
function storable(e: CheckedExample): boolean {
  const lowered = e.distractors.map((d) => d.normalize("NFC").trim().toLocaleLowerCase("es"));
  return (
    lowered.length === 3 &&
    new Set(lowered).size === 3 &&
    !lowered.includes(e.surfaceForm.toLocaleLowerCase("es")) &&
    countWords(e.text) <= MAX_SENTENCE_WORDS
  );
}

const nullToUndefined = <T>(v: T | null): T | undefined => (v === null ? undefined : v);

export type Converted = { lemmas: LemmaInput[]; refused: { key: string; problems: string[] }[] };

export function toImportLemmas(word: CheckedWord): Converted {
  const lemmas: LemmaInput[] = [];
  const refused: Converted["refused"] = [];
  for (const l of word.lemmas) {
    const key = lemmaKey(l.headword, l.partOfSpeech);
    const senses = l.senses.map((s, i) => {
      const passed = word.reviewed && s.failures.length === 0;
      const checkNotes: CheckNotes = {
        checkedAt: word.checkedAt,
        ...(s.reviewerGloss ? { reviewerGloss: s.reviewerGloss } : {}),
        failures: [
          ...(word.reviewed
            ? []
            : [{ field: "review", check: "not-reviewed", message: "No independent review yet." }]),
          ...s.failures,
        ],
      };
      return {
        key: `${key}#${i + 1}`,
        gloss: s.gloss,
        definition: s.definition,
        frequencyRank: word.candidate.rank,
        themes: s.themes.filter((t) => /^[a-z0-9-]{1,40}$/.test(t)).slice(0, 10),
        register: s.register,
        region: s.register === "regional" ? nullToUndefined(s.region) : undefined,
        cognate: s.cognate,
        cognateEnglish: s.cognate === "none" ? undefined : (s.cognateEnglish ?? undefined),
        concreteness: s.concreteness,
        imageDescription:
          s.concreteness === "concrete" ? nullToUndefined(s.imageDescription) : undefined,
        checkNotes,
        status: passed ? ("ai_checked" as const) : ("draft" as const),
        // An example the import would refuse (its failure is already listed) is left out,
        // so one bad distractor list does not hold back the whole word.
        examples: s.examples.filter(storable).map((e) => ({
          text: e.text,
          surfaceForm: e.surfaceForm,
          start: e.start,
          end: e.end,
          translation: e.translation,
          distractors: e.distractors.map((d) => d.normalize("NFC").trim()),
          source: "ai" as const,
        })),
        hooks: s.hook ? [{ ...s.hook, source: "ai" as const }] : [],
        relations: s.relations,
        misuses: s.misuses.map((m) => ({
          text: m.text,
          explanation: m.why,
          source: "ai" as const,
        })),
      };
    });
    const lemma: LemmaInput = {
      key,
      headword: l.headword,
      partOfSpeech: l.partOfSpeech,
      gender: l.partOfSpeech === "noun" ? (l.gender ?? undefined) : undefined,
      articleOverride: l.partOfSpeech === "noun" ? nullToUndefined(l.articleOverride) : undefined,
      plural: ["noun", "adjective"].includes(l.partOfSpeech)
        ? nullToUndefined(l.plural)
        : undefined,
      feminine: l.partOfSpeech === "adjective" ? nullToUndefined(l.feminine) : undefined,
      formsNote: nullToUndefined(l.formsNote),
      frequencyRank: word.candidate.rank,
      status: senses.every((s) => s.status === "ai_checked") ? "ai_checked" : "draft",
      wordParts: l.wordParts,
      senses,
    };
    const parsed = importPayloadSchema.safeParse({ lemmas: [lemma] });
    if (parsed.success) lemmas.push(lemma);
    else
      refused.push({
        key,
        problems: parsed.error.issues.map((i) => `${i.path.slice(2).join(".")}: ${i.message}`),
      });
  }
  return { lemmas, refused };
}
