CREATE TYPE "public"."review_action" AS ENUM('edit', 'approve', 'reject', 'publish');--> statement-breakpoint
CREATE TABLE "review_log" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "review_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewer_id" text,
	"sense_id" integer,
	"pseudoword_id" integer,
	"action" "review_action" NOT NULL,
	"reason" text,
	CONSTRAINT "review_log_one_target" CHECK (num_nonnulls("review_log"."sense_id", "review_log"."pseudoword_id") = 1)
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "can_review" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "review_log" ADD CONSTRAINT "review_log_reviewer_id_user_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_log" ADD CONSTRAINT "review_log_sense_id_sense_id_fk" FOREIGN KEY ("sense_id") REFERENCES "public"."sense"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_log" ADD CONSTRAINT "review_log_pseudoword_id_pseudoword_id_fk" FOREIGN KEY ("pseudoword_id") REFERENCES "public"."pseudoword"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "review_log_sense_idx" ON "review_log" USING btree ("sense_id","at");--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_reviewer_role" CHECK (NOT "user"."can_review" OR "user"."role" IN ('teacher', 'admin'));