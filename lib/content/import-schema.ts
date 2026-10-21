import { z } from "zod";
import {
  ARTICLE_OVERRIDES,
  COGNATE_STATUSES,
  CONCRETENESS,
  CONTENT_SOURCES,
  GENDERS,
  HOOK_KINDS,
  IMPORT_STATUSES,
  PARTS_OF_SPEECH,
  REGISTERS,
  RELATION_TYPES,
  WORD_PART_KINDS,
} from "./constants";

// The JSON the content scripts upload to POST /api/admin/import. Each lemma is a full
// description of that word: its senses, and each sense's examples, hooks, relations and
// images in display order. Strict objects reject unknown fields, so a misspelled field in
// a script fails loudly instead of being dropped.

export const MAX_GLOSS_WORDS = 7; // spec: "under 8 words"
export const MAX_SENTENCE_WORDS = 20;
export const MAX_LEMMAS_PER_IMPORT = 200;

export function countWords(s: string): number {
  return s.split(/\s+/).filter((token) => /[\p{L}\p{N}]/u.test(token)).length;
}

const text = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    // Offsets are character positions, so a decomposed "ñ" (n + combining tilde) would
    // shift every offset after it. Scripts must send NFC text.
    .refine((s) => s === s.normalize("NFC"), "must be NFC-normalized")
    .refine((s) => s.trim() === s, "must not start or end with whitespace");

// Stable keys such as "cuenta#noun#2" identify rows across imports and environments.
const contentKey = z
  .string()
  .max(120)
  .regex(/^[\p{Ll}\p{Nd}_.-]+(?:#[\p{Ll}\p{Nd}_.-]+)+$/u, "must look like lemma#pos or lemma#pos#n")
  .refine((s) => s === s.normalize("NFC"), "must be NFC-normalized");

// A path inside the media bucket. Each segment starts with a letter or digit, so ".."
// and absolute paths cannot be expressed.
const fileKey = z
  .string()
  .max(200)
  .regex(/^[a-z0-9][a-z0-9_.-]*(?:\/[a-z0-9][a-z0-9_.-]*)*$/, "must be a relative media path");

const audioSchema = z.strictObject({
  fileKey,
  voiceId: text(50),
  generatedAt: z.iso.datetime({ offset: true }),
});

const exampleSchema = z
  .strictObject({
    text: text(300).refine(
      (s) => countWords(s) <= MAX_SENTENCE_WORDS,
      `must be ${MAX_SENTENCE_WORDS} words or fewer`,
    ),
    surfaceForm: text(60),
    start: z.int().min(0),
    end: z.int().min(1),
    translation: text(300),
    distractors: z.array(text(60)).length(3),
    source: z.enum(CONTENT_SOURCES),
    difficulty: z.number().finite().optional(),
    audio: audioSchema.optional(),
  })
  .superRefine((ex, ctx) => {
    if (ex.end <= ex.start) {
      ctx.addIssue({ code: "custom", path: ["end"], message: "must be greater than start" });
    } else if (ex.end > ex.text.length) {
      ctx.addIssue({ code: "custom", path: ["end"], message: "is past the end of the sentence" });
    } else if (ex.text.slice(ex.start, ex.end) !== ex.surfaceForm) {
      ctx.addIssue({
        code: "custom",
        path: ["surfaceForm"],
        message: `does not match text at ${ex.start}–${ex.end} ("${ex.text.slice(ex.start, ex.end)}")`,
      });
    }
    const lowered = ex.distractors.map((d) => d.toLocaleLowerCase("es"));
    if (new Set(lowered).size !== lowered.length) {
      ctx.addIssue({ code: "custom", path: ["distractors"], message: "must be distinct" });
    }
    if (lowered.includes(ex.surfaceForm.toLocaleLowerCase("es"))) {
      ctx.addIssue({
        code: "custom",
        path: ["distractors"],
        message: "must not include the surface form",
      });
    }
  });

const hookSchema = z.strictObject({
  kind: z.enum(HOOK_KINDS),
  text: text(300),
  source: z.enum(CONTENT_SOURCES),
});

const relationSchema = z.strictObject({
  type: z.enum(RELATION_TYPES),
  // What the chip or usage note shows, e.g. "provecho" or "tomar una decisión".
  text: text(80),
  // Links to that sense's page when it exists and is live. Resolved when the page is read,
  // so the target can be imported later.
  targetKey: contentKey.optional(),
});

const imageSchema = z.strictObject({
  fileKey,
  alt: text(200),
  source: text(200),
  license: text(100),
  attribution: text(200),
});

const senseSchema = z
  .strictObject({
    key: contentKey,
    gloss: text(60).refine(
      (s) => countWords(s) <= MAX_GLOSS_WORDS,
      `must be under ${MAX_GLOSS_WORDS + 1} words`,
    ),
    definition: text(300),
    frequencyRank: z.int().min(1),
    difficulty: z.number().finite().optional(),
    themes: z
      .array(z.string().regex(/^[a-z0-9-]{1,40}$/))
      .max(10)
      .default([]),
    register: z.enum(REGISTERS),
    region: text(60).optional(),
    cognate: z.enum(COGNATE_STATUSES),
    cognateEnglish: text(60).optional(),
    concreteness: z.enum(CONCRETENESS),
    status: z.enum(IMPORT_STATUSES),
    examples: z.array(exampleSchema).max(8).default([]),
    hooks: z.array(hookSchema).max(3).default([]),
    relations: z.array(relationSchema).max(30).default([]),
    images: z.array(imageSchema).max(3).default([]),
  })
  .superRefine((s, ctx) => {
    if ((s.register === "regional") !== (s.region !== undefined)) {
      ctx.addIssue({
        code: "custom",
        path: ["region"],
        message: "is required for a regional register and only allowed there",
      });
    }
    if ((s.cognate === "none") !== (s.cognateEnglish === undefined)) {
      ctx.addIssue({
        code: "custom",
        path: ["cognateEnglish"],
        message: "is required for a cognate or false friend and only allowed there",
      });
    }
    if (s.concreteness !== "concrete" && s.images.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["images"],
        message: "only concrete senses get images",
      });
    }
    s.relations.forEach((r, i) => {
      if (r.targetKey === s.key) {
        ctx.addIssue({
          code: "custom",
          path: ["relations", i, "targetKey"],
          message: "cannot point at its own sense",
        });
      }
    });
  });

const wordPartSchema = z.strictObject({
  kind: z.enum(WORD_PART_KINDS),
  text: text(30),
  meaning: text(60),
});

const lemmaSchema = z
  .strictObject({
    key: contentKey,
    headword: text(60),
    partOfSpeech: z.enum(PARTS_OF_SPEECH),
    gender: z.enum(GENDERS).optional(),
    articleOverride: z.enum(ARTICLE_OVERRIDES).optional(),
    plural: text(60).optional(),
    feminine: text(60).optional(),
    formsNote: text(300).optional(),
    frequencyRank: z.int().min(1),
    status: z.enum(IMPORT_STATUSES),
    audio: audioSchema.optional(),
    wordParts: z.array(wordPartSchema).max(6).default([]),
    senses: z.array(senseSchema).min(1).max(20),
  })
  .superRefine((l, ctx) => {
    const isNoun = l.partOfSpeech === "noun";
    if (isNoun !== (l.gender !== undefined)) {
      ctx.addIssue({
        code: "custom",
        path: ["gender"],
        message: "is required for nouns and only allowed there",
      });
    }
    if (!isNoun && l.articleOverride !== undefined) {
      ctx.addIssue({ code: "custom", path: ["articleOverride"], message: "is only for nouns" });
    }
    if (l.partOfSpeech !== "adjective" && l.feminine !== undefined) {
      ctx.addIssue({ code: "custom", path: ["feminine"], message: "is only for adjectives" });
    }
    if (!isNoun && l.partOfSpeech !== "adjective" && l.plural !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["plural"],
        message: "is only for nouns and adjectives",
      });
    }
    l.senses.forEach((s, i) => {
      if (!s.key.startsWith(`${l.key}#`)) {
        ctx.addIssue({
          code: "custom",
          path: ["senses", i, "key"],
          message: `must start with the lemma key "${l.key}#"`,
        });
      }
    });
  });

const listSchema = z.strictObject({
  key: z.string().regex(/^[a-z0-9-]{1,80}$/, "must be a lowercase slug such as level-1"),
  name: text(80),
  description: text(300).optional(),
  status: z.enum(IMPORT_STATUSES),
  senseKeys: z
    .array(contentKey)
    .max(2000)
    .refine((keys) => new Set(keys).size === keys.length, "must not repeat a sense"),
});

export const importPayloadSchema = z
  .strictObject({
    // Marks AI-written test fixtures. The import endpoint refuses these in production.
    fixture: z.boolean().default(false),
    note: z.string().max(500).optional(),
    lemmas: z.array(lemmaSchema).max(MAX_LEMMAS_PER_IMPORT),
    lists: z.array(listSchema).max(50).default([]),
  })
  .superRefine((p, ctx) => {
    const flagDuplicates = (keys: { key: string; path: (string | number)[] }[]) => {
      const seen = new Set<string>();
      for (const { key, path } of keys) {
        if (seen.has(key))
          ctx.addIssue({ code: "custom", path, message: `duplicate key "${key}"` });
        seen.add(key);
      }
    };
    flagDuplicates(p.lemmas.map((l, i) => ({ key: l.key, path: ["lemmas", i, "key"] })));
    flagDuplicates(
      p.lemmas.flatMap((l, i) =>
        l.senses.map((s, j) => ({ key: s.key, path: ["lemmas", i, "senses", j, "key"] })),
      ),
    );
    flagDuplicates(p.lists.map((l, i) => ({ key: l.key, path: ["lists", i, "key"] })));
  });

export type ImportPayloadInput = z.input<typeof importPayloadSchema>;
export type ImportPayload = z.output<typeof importPayloadSchema>;
export type LemmaInput = ImportPayload["lemmas"][number];
export type SenseInput = LemmaInput["senses"][number];
