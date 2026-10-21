import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import {
  ARTICLE_OVERRIDES,
  COGNATE_STATUSES,
  CONCRETENESS,
  CONTENT_SOURCES,
  CONTENT_STATUSES,
  GENDERS,
  HOOK_KINDS,
  LEVEL_BAND_SIZE,
  PARTS_OF_SPEECH,
  REGISTERS,
  RELATION_TYPES,
  WORD_PART_KINDS,
} from "@/lib/content/constants";

// Content tables (spec: Content model). Rows are never deleted: student history points
// at sense and example IDs, so content is retired instead. Check constraints repeat the
// most important import rules so a buggy script cannot store a broken row.

export const contentStatus = pgEnum("content_status", CONTENT_STATUSES);
export const partOfSpeech = pgEnum("part_of_speech", PARTS_OF_SPEECH);
export const nounGender = pgEnum("noun_gender", GENDERS);
export const articleOverride = pgEnum("article_override", ARTICLE_OVERRIDES);
export const register = pgEnum("register", REGISTERS);
export const cognateStatus = pgEnum("cognate_status", COGNATE_STATUSES);
export const concreteness = pgEnum("concreteness", CONCRETENESS);
export const contentSource = pgEnum("content_source", CONTENT_SOURCES);
export const hookKind = pgEnum("hook_kind", HOOK_KINDS);
export const wordPartKind = pgEnum("word_part_kind", WORD_PART_KINDS);
export const relationType = pgEnum("relation_type", RELATION_TYPES);

// Every content row has a status and a version. An import that changes a row bumps the
// version and saves the old row in content_revision.
const contentColumns = () => ({
  status: contentStatus("status").notNull().default("draft"),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const lemma = pgTable(
  "lemma",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    key: text("key").notNull().unique(),
    headword: text("headword").notNull(),
    partOfSpeech: partOfSpeech("part_of_speech").notNull(),
    gender: nounGender("gender"),
    articleOverride: articleOverride("article_override"),
    plural: text("plural"), // only when irregular
    feminine: text("feminine"), // adjectives with an irregular feminine form
    formsNote: text("forms_note"), // key irregular verb forms
    frequencyRank: integer("frequency_rank").notNull(),
    ...contentColumns(),
  },
  (t) => [
    check("lemma_rank_positive", sql`${t.frequencyRank} >= 1`),
    check("lemma_noun_gender", sql`(${t.partOfSpeech} = 'noun') = (${t.gender} IS NOT NULL)`),
    check(
      "lemma_article_nouns_only",
      sql`${t.articleOverride} IS NULL OR ${t.partOfSpeech} = 'noun'`,
    ),
  ],
);

export const sense = pgTable(
  "sense",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    lemmaId: integer("lemma_id")
      .notNull()
      .references(() => lemma.id),
    key: text("key").notNull().unique(),
    gloss: text("gloss").notNull(),
    definition: text("definition").notNull(),
    frequencyRank: integer("frequency_rank").notNull(),
    // Computed by Postgres from the rank, so it can never disagree with it. No maximum.
    level: integer("level")
      .notNull()
      .generatedAlwaysAs(sql`("frequency_rank" - 1) / ${sql.raw(String(LEVEL_BAND_SIZE))} + 1`),
    difficulty: real("difficulty"), // fitted from real answers later
    themes: text("themes")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    register: register("register").notNull(),
    region: text("region"),
    cognate: cognateStatus("cognate").notNull(),
    cognateEnglish: text("cognate_english"),
    concreteness: concreteness("concreteness").notNull(),
    ...contentColumns(),
  },
  (t) => [
    index("sense_lemma_idx").on(t.lemmaId),
    index("sense_level_idx").on(t.level),
    check("sense_rank_positive", sql`${t.frequencyRank} >= 1`),
    check("sense_region", sql`(${t.register} = 'regional') = (${t.region} IS NOT NULL)`),
    check("sense_cognate_english", sql`(${t.cognate} = 'none') = (${t.cognateEnglish} IS NULL)`),
  ],
);

export const example = pgTable(
  "example",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    senseId: integer("sense_id")
      .notNull()
      .references(() => sense.id),
    position: integer("position").notNull(),
    text: text("text").notNull(),
    surfaceForm: text("surface_form").notNull(),
    // Character offsets of surface_form in text: start inclusive, end exclusive.
    startOffset: integer("start_offset").notNull(),
    endOffset: integer("end_offset").notNull(),
    translation: text("translation").notNull(),
    distractors: text("distractors").array().notNull(),
    source: contentSource("source").notNull(),
    difficulty: real("difficulty"),
    ...contentColumns(),
  },
  (t) => [
    unique("example_sense_position").on(t.senseId, t.position),
    check(
      "example_offsets",
      sql`${t.startOffset} >= 0 AND ${t.endOffset} > ${t.startOffset} AND ${t.endOffset} <= char_length(${t.text})`,
    ),
    check(
      "example_surface_at_offsets",
      sql`substring(${t.text} from ${t.startOffset} + 1 for ${t.endOffset} - ${t.startOffset}) = ${t.surfaceForm}`,
    ),
    check("example_three_distractors", sql`cardinality(${t.distractors}) = 3`),
  ],
);

export const wordPart = pgTable(
  "word_part",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    lemmaId: integer("lemma_id")
      .notNull()
      .references(() => lemma.id),
    position: integer("position").notNull(),
    kind: wordPartKind("kind").notNull(),
    text: text("text").notNull(),
    meaning: text("meaning").notNull(),
    ...contentColumns(),
  },
  (t) => [unique("word_part_lemma_position").on(t.lemmaId, t.position)],
);

export const relation = pgTable(
  "relation",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    senseId: integer("sense_id")
      .notNull()
      .references(() => sense.id),
    position: integer("position").notNull(),
    type: relationType("type").notNull(),
    text: text("text").notNull(),
    // Stable key of the related sense. Not a foreign key: the target may be imported
    // later, and the word page links to it only once it exists and is live.
    targetKey: text("target_key"),
    ...contentColumns(),
  },
  (t) => [unique("relation_sense_position").on(t.senseId, t.position)],
);

export const hook = pgTable(
  "hook",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    senseId: integer("sense_id")
      .notNull()
      .references(() => sense.id),
    position: integer("position").notNull(),
    kind: hookKind("kind").notNull(),
    text: text("text").notNull(),
    source: contentSource("source").notNull(),
    ...contentColumns(),
  },
  (t) => [unique("hook_sense_position").on(t.senseId, t.position)],
);

export const image = pgTable(
  "image",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    senseId: integer("sense_id")
      .notNull()
      .references(() => sense.id),
    position: integer("position").notNull(),
    fileKey: text("file_key").notNull(),
    alt: text("alt").notNull(),
    source: text("source").notNull(),
    license: text("license").notNull(),
    attribution: text("attribution").notNull(),
    ...contentColumns(),
  },
  (t) => [unique("image_sense_position").on(t.senseId, t.position)],
);

export const audio = pgTable(
  "audio",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    lemmaId: integer("lemma_id")
      .unique()
      .references(() => lemma.id),
    exampleId: integer("example_id")
      .unique()
      .references(() => example.id),
    fileKey: text("file_key").notNull(),
    voiceId: text("voice_id").notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull(),
    ...contentColumns(),
  },
  (t) => [check("audio_one_owner", sql`num_nonnulls(${t.lemmaId}, ${t.exampleId}) = 1`)],
);

export const wordList = pgTable("word_list", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  ...contentColumns(),
});

export const wordListItem = pgTable(
  "word_list_item",
  {
    listId: integer("list_id")
      .notNull()
      .references(() => wordList.id),
    senseId: integer("sense_id")
      .notNull()
      .references(() => sense.id),
    position: integer("position").notNull(),
  },
  (t) => [primaryKey({ columns: [t.listId, t.senseId] })],
);

// Old versions of edited content rows, as JSON snapshots of the full row.
export const contentRevision = pgTable(
  "content_revision",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    tableName: text("table_name").notNull(),
    rowId: integer("row_id").notNull(),
    version: integer("version").notNull(),
    snapshot: jsonb("snapshot").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("content_revision_row_version").on(t.tableName, t.rowId, t.version)],
);
