import { z } from "zod";
import type { CandidateRow } from "./candidates.ts";
import type { Usage } from "./run.ts";
import {
  COGNATE_STATUSES,
  CONCRETENESS,
  GENDERS,
  HOOK_KINDS,
  REGISTERS,
  RELATION_TYPES,
  WORD_PART_KINDS,
} from "../../../lib/content/constants.ts";

// What the generation step (spec: Content pipeline, step 2) asks the model for, per
// candidate word. It mirrors the import format (lib/content/import-schema.ts) but leaves out
// what code works out: character offsets, keys, ranks, statuses. Fields are nullable rather
// than optional because structured outputs need every field present.

/** Parts of speech a candidate can be taught as (function words are dropped in step 1). */
export const TAUGHT_POS = [
  "noun",
  "verb",
  "adjective",
  "adverb",
  "interjection",
  "numeral",
  "determiner",
  "phrase",
] as const;

/** Levels whose example sentences may use only words at or below their level. */
export const VOCABULARY_LIMITED_LEVELS = 3;
export const EXAMPLES_PER_SENSE = 4;
export const MISUSES_PER_SENSE = 2;

const exampleSchema = z.object({
  /** One Spanish sentence, 20 words or fewer. */
  text: z.string(),
  /** The target word exactly as it appears in the sentence, e.g. a conjugated form. */
  surfaceForm: z.string(),
  translation: z.string(),
  /** Three wrong surface forms that fit the gap grammatically but not in meaning. */
  distractors: z.array(z.string()),
});

const senseSchema = z.object({
  gloss: z.string(),
  definition: z.string(),
  register: z.enum(REGISTERS),
  region: z.string().nullable(),
  cognate: z.enum(COGNATE_STATUSES),
  cognateEnglish: z.string().nullable(),
  concreteness: z.enum(CONCRETENESS),
  /** For concrete senses: one line describing a picture that shows the meaning, no text. */
  imageDescription: z.string().nullable(),
  themes: z.array(z.string()),
  examples: z.array(exampleSchema),
  hook: z.object({ kind: z.enum(HOOK_KINDS), text: z.string() }).nullable(),
  relations: z.array(z.object({ type: z.enum(RELATION_TYPES), text: z.string() })),
  /** Sentences that use the word wrongly, for "which sentence uses the word correctly". */
  misuses: z.array(z.object({ text: z.string(), why: z.string() })),
});

const lemmaSchema = z.object({
  headword: z.string(),
  partOfSpeech: z.enum(TAUGHT_POS),
  gender: z.enum(GENDERS).nullable(),
  articleOverride: z.enum(["el", "la"]).nullable(),
  plural: z.string().nullable(),
  feminine: z.string().nullable(),
  formsNote: z.string().nullable(),
  wordParts: z.array(
    z.object({ kind: z.enum(WORD_PART_KINDS), text: z.string(), meaning: z.string() }),
  ),
  /** Senses common at this word's level, most common first. */
  senses: z.array(senseSchema),
  /** Senses to teach at a higher level, recorded for later. */
  laterSenses: z.array(z.object({ gloss: z.string(), note: z.string() })),
});

export const generatedWordSchema = z.object({
  /** One entry per part of speech worth teaching now (an adverb that is also a common noun). */
  lemmas: z.array(lemmaSchema),
  /** Set when the candidate should not become a card at all, with the reason. */
  skipReason: z.string().nullable(),
});

export type GeneratedWord = z.infer<typeof generatedWordSchema>;
export type GeneratedLemma = GeneratedWord["lemmas"][number];
export type GeneratedSense = GeneratedLemma["senses"][number];

/** One file in content/generated/: the answer for one candidate, with what it cost. */
export type GeneratedFile = {
  candidate: CandidateRow;
  model: string;
  effort: string;
  batch: boolean;
  generatedAt: string;
  usage: Usage;
  costUsd: number;
  output: GeneratedWord;
};
