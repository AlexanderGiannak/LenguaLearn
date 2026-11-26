CREATE TYPE "public"."report_reason" AS ENUM('answer_marked_wrong', 'wrong_meaning', 'two_answers', 'spelling', 'audio', 'confusing', 'other');--> statement-breakpoint
ALTER TYPE "public"."review_action" ADD VALUE 'resolve_reports';--> statement-breakpoint
CREATE TABLE "content_report" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "content_report_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"sense_id" integer NOT NULL,
	"reporter_id" text NOT NULL,
	"reason" "report_reason" NOT NULL,
	"text" varchar(300),
	"question_type" text,
	"resolved_at" timestamp with time zone,
	"resolved_by" text,
	CONSTRAINT "content_report_text_len" CHECK (char_length("content_report"."text") <= 300)
);
--> statement-breakpoint
ALTER TABLE "content_report" ADD CONSTRAINT "content_report_sense_id_sense_id_fk" FOREIGN KEY ("sense_id") REFERENCES "public"."sense"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_report" ADD CONSTRAINT "content_report_reporter_id_user_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_report" ADD CONSTRAINT "content_report_resolved_by_user_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "content_report_open_once" ON "content_report" USING btree ("sense_id","reporter_id") WHERE "content_report"."resolved_at" is null;--> statement-breakpoint
CREATE INDEX "content_report_reporter_idx" ON "content_report" USING btree ("reporter_id","at");