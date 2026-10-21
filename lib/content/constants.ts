// Allowed values for content fields. The database enums (lib/db/schema) and the import
// validation (import-schema.ts) are both built from these lists, so they cannot drift.

export const CONTENT_STATUSES = ["draft", "ai_checked", "approved", "live", "retired"] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

/** The import endpoint may only create rows in these statuses (spec: Content pipeline). */
export const IMPORT_STATUSES = ["draft", "ai_checked"] as const satisfies readonly ContentStatus[];
export type ImportStatus = (typeof IMPORT_STATUSES)[number];

export const PARTS_OF_SPEECH = [
  "noun",
  "verb",
  "adjective",
  "adverb",
  "pronoun",
  "preposition",
  "conjunction",
  "determiner",
  "interjection",
  "numeral",
  "phrase",
] as const;
export type PartOfSpeech = (typeof PARTS_OF_SPEECH)[number];

/** Noun gender. "both" is a common-gender noun such as el/la estudiante. */
export const GENDERS = ["m", "f", "both"] as const;
export type Gender = (typeof GENDERS)[number];

/** Overrides the article a noun would get from its gender (a feminine noun taking "el"). */
export const ARTICLE_OVERRIDES = ["el", "la"] as const;

export const REGISTERS = ["neutral", "formal", "informal", "regional"] as const;
export type Register = (typeof REGISTERS)[number];

/** The spec's "none, true, or false" cognate status, with names that read clearly in code. */
export const COGNATE_STATUSES = ["none", "true_cognate", "false_friend"] as const;
export type CognateStatus = (typeof COGNATE_STATUSES)[number];

export const CONCRETENESS = ["concrete", "abstract"] as const;

export const CONTENT_SOURCES = ["human", "ai"] as const;

export const HOOK_KINDS = ["mnemonic", "etymology"] as const;

export const WORD_PART_KINDS = ["prefix", "root", "suffix"] as const;

export const RELATION_TYPES = [
  "synonym",
  "antonym",
  "family",
  "confused_with",
  "collocation",
] as const;
export type RelationType = (typeof RELATION_TYPES)[number];

/** Senses per level band (spec: Levels). There is deliberately no maximum level. */
export const LEVEL_BAND_SIZE = 500;
