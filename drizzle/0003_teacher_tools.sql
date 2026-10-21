ALTER TABLE "answer_event" ADD COLUMN "active_ms" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sense_progress" ADD COLUMN "first_learned_at" timestamp with time zone;