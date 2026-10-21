CREATE TYPE "public"."article_override" AS ENUM('el', 'la');--> statement-breakpoint
CREATE TYPE "public"."cognate_status" AS ENUM('none', 'true_cognate', 'false_friend');--> statement-breakpoint
CREATE TYPE "public"."concreteness" AS ENUM('concrete', 'abstract');--> statement-breakpoint
CREATE TYPE "public"."content_source" AS ENUM('human', 'ai');--> statement-breakpoint
CREATE TYPE "public"."content_status" AS ENUM('draft', 'ai_checked', 'approved', 'live', 'retired');--> statement-breakpoint
CREATE TYPE "public"."hook_kind" AS ENUM('mnemonic', 'etymology');--> statement-breakpoint
CREATE TYPE "public"."noun_gender" AS ENUM('m', 'f', 'both');--> statement-breakpoint
CREATE TYPE "public"."part_of_speech" AS ENUM('noun', 'verb', 'adjective', 'adverb', 'pronoun', 'preposition', 'conjunction', 'determiner', 'interjection', 'numeral', 'phrase');--> statement-breakpoint
CREATE TYPE "public"."register" AS ENUM('neutral', 'formal', 'informal', 'regional');--> statement-breakpoint
CREATE TYPE "public"."relation_type" AS ENUM('synonym', 'antonym', 'family', 'confused_with', 'collocation');--> statement-breakpoint
CREATE TYPE "public"."word_part_kind" AS ENUM('prefix', 'root', 'suffix');--> statement-breakpoint
CREATE TABLE "audio" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audio_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"lemma_id" integer,
	"example_id" integer,
	"file_key" text NOT NULL,
	"voice_id" text NOT NULL,
	"generated_at" timestamp with time zone NOT NULL,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audio_lemma_id_unique" UNIQUE("lemma_id"),
	CONSTRAINT "audio_example_id_unique" UNIQUE("example_id"),
	CONSTRAINT "audio_one_owner" CHECK (num_nonnulls("audio"."lemma_id", "audio"."example_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "content_revision" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "content_revision_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"table_name" text NOT NULL,
	"row_id" integer NOT NULL,
	"version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_revision_row_version" UNIQUE("table_name","row_id","version")
);
--> statement-breakpoint
CREATE TABLE "example" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "example_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"sense_id" integer NOT NULL,
	"position" integer NOT NULL,
	"text" text NOT NULL,
	"surface_form" text NOT NULL,
	"start_offset" integer NOT NULL,
	"end_offset" integer NOT NULL,
	"translation" text NOT NULL,
	"distractors" text[] NOT NULL,
	"source" "content_source" NOT NULL,
	"difficulty" real,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "example_sense_position" UNIQUE("sense_id","position"),
	CONSTRAINT "example_offsets" CHECK ("example"."start_offset" >= 0 AND "example"."end_offset" > "example"."start_offset" AND "example"."end_offset" <= char_length("example"."text")),
	CONSTRAINT "example_surface_at_offsets" CHECK (substring("example"."text" from "example"."start_offset" + 1 for "example"."end_offset" - "example"."start_offset") = "example"."surface_form"),
	CONSTRAINT "example_three_distractors" CHECK (cardinality("example"."distractors") = 3)
);
--> statement-breakpoint
CREATE TABLE "hook" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "hook_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"sense_id" integer NOT NULL,
	"position" integer NOT NULL,
	"kind" "hook_kind" NOT NULL,
	"text" text NOT NULL,
	"source" "content_source" NOT NULL,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hook_sense_position" UNIQUE("sense_id","position")
);
--> statement-breakpoint
CREATE TABLE "image" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "image_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"sense_id" integer NOT NULL,
	"position" integer NOT NULL,
	"file_key" text NOT NULL,
	"alt" text NOT NULL,
	"source" text NOT NULL,
	"license" text NOT NULL,
	"attribution" text NOT NULL,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "image_sense_position" UNIQUE("sense_id","position")
);
--> statement-breakpoint
CREATE TABLE "lemma" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "lemma_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"key" text NOT NULL,
	"headword" text NOT NULL,
	"part_of_speech" "part_of_speech" NOT NULL,
	"gender" "noun_gender",
	"article_override" "article_override",
	"plural" text,
	"feminine" text,
	"forms_note" text,
	"frequency_rank" integer NOT NULL,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lemma_key_unique" UNIQUE("key"),
	CONSTRAINT "lemma_rank_positive" CHECK ("lemma"."frequency_rank" >= 1),
	CONSTRAINT "lemma_noun_gender" CHECK (("lemma"."part_of_speech" = 'noun') = ("lemma"."gender" IS NOT NULL)),
	CONSTRAINT "lemma_article_nouns_only" CHECK ("lemma"."article_override" IS NULL OR "lemma"."part_of_speech" = 'noun')
);
--> statement-breakpoint
CREATE TABLE "relation" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "relation_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"sense_id" integer NOT NULL,
	"position" integer NOT NULL,
	"type" "relation_type" NOT NULL,
	"text" text NOT NULL,
	"target_key" text,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "relation_sense_position" UNIQUE("sense_id","position")
);
--> statement-breakpoint
CREATE TABLE "sense" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sense_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"lemma_id" integer NOT NULL,
	"key" text NOT NULL,
	"gloss" text NOT NULL,
	"definition" text NOT NULL,
	"frequency_rank" integer NOT NULL,
	"level" integer GENERATED ALWAYS AS (("frequency_rank" - 1) / 500 + 1) STORED NOT NULL,
	"difficulty" real,
	"themes" text[] DEFAULT '{}'::text[] NOT NULL,
	"register" "register" NOT NULL,
	"region" text,
	"cognate" "cognate_status" NOT NULL,
	"cognate_english" text,
	"concreteness" "concreteness" NOT NULL,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sense_key_unique" UNIQUE("key"),
	CONSTRAINT "sense_rank_positive" CHECK ("sense"."frequency_rank" >= 1),
	CONSTRAINT "sense_region" CHECK (("sense"."register" = 'regional') = ("sense"."region" IS NOT NULL)),
	CONSTRAINT "sense_cognate_english" CHECK (("sense"."cognate" = 'none') = ("sense"."cognate_english" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "word_list" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "word_list_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "word_list_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "word_list_item" (
	"list_id" integer NOT NULL,
	"sense_id" integer NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "word_list_item_list_id_sense_id_pk" PRIMARY KEY("list_id","sense_id")
);
--> statement-breakpoint
CREATE TABLE "word_part" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "word_part_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"lemma_id" integer NOT NULL,
	"position" integer NOT NULL,
	"kind" "word_part_kind" NOT NULL,
	"text" text NOT NULL,
	"meaning" text NOT NULL,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "word_part_lemma_position" UNIQUE("lemma_id","position")
);
--> statement-breakpoint
ALTER TABLE "audio" ADD CONSTRAINT "audio_lemma_id_lemma_id_fk" FOREIGN KEY ("lemma_id") REFERENCES "public"."lemma"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audio" ADD CONSTRAINT "audio_example_id_example_id_fk" FOREIGN KEY ("example_id") REFERENCES "public"."example"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "example" ADD CONSTRAINT "example_sense_id_sense_id_fk" FOREIGN KEY ("sense_id") REFERENCES "public"."sense"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hook" ADD CONSTRAINT "hook_sense_id_sense_id_fk" FOREIGN KEY ("sense_id") REFERENCES "public"."sense"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "image" ADD CONSTRAINT "image_sense_id_sense_id_fk" FOREIGN KEY ("sense_id") REFERENCES "public"."sense"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relation" ADD CONSTRAINT "relation_sense_id_sense_id_fk" FOREIGN KEY ("sense_id") REFERENCES "public"."sense"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sense" ADD CONSTRAINT "sense_lemma_id_lemma_id_fk" FOREIGN KEY ("lemma_id") REFERENCES "public"."lemma"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word_list_item" ADD CONSTRAINT "word_list_item_list_id_word_list_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."word_list"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word_list_item" ADD CONSTRAINT "word_list_item_sense_id_sense_id_fk" FOREIGN KEY ("sense_id") REFERENCES "public"."sense"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word_part" ADD CONSTRAINT "word_part_lemma_id_lemma_id_fk" FOREIGN KEY ("lemma_id") REFERENCES "public"."lemma"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sense_lemma_idx" ON "sense" USING btree ("lemma_id");--> statement-breakpoint
CREATE INDEX "sense_level_idx" ON "sense" USING btree ("level");