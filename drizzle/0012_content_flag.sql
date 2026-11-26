CREATE TYPE "public"."stat_flag_kind" AS ENUM('low_accuracy', 'distractor_magnet', 'slow');--> statement-breakpoint
ALTER TYPE "public"."review_action" ADD VALUE 'resolve_flags';--> statement-breakpoint
CREATE TABLE "content_flag" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "content_flag_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"sense_id" integer NOT NULL,
	"kind" "stat_flag_kind" NOT NULL,
	"detail" jsonb NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" text
);
--> statement-breakpoint
ALTER TABLE "content_flag" ADD CONSTRAINT "content_flag_sense_id_sense_id_fk" FOREIGN KEY ("sense_id") REFERENCES "public"."sense"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_flag" ADD CONSTRAINT "content_flag_resolved_by_user_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "content_flag_open_once" ON "content_flag" USING btree ("sense_id","kind") WHERE "content_flag"."resolved_at" is null;--> statement-breakpoint
CREATE INDEX "content_flag_sense_idx" ON "content_flag" USING btree ("sense_id","resolved_at");