ALTER TYPE "public"."review_action" ADD VALUE 'flag_audio';--> statement-breakpoint
ALTER TABLE "audio" ADD COLUMN "spoken_text" text DEFAULT '' NOT NULL;