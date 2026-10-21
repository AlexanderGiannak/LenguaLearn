CREATE TABLE "answer_flag" (
	"answer_event_id" bigint PRIMARY KEY NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "answer_flag_reason" CHECK ("answer_flag"."reason" IN ('fast', 'same_position', 'hidden_tab'))
);
--> statement-breakpoint
ALTER TABLE "answer_event" ADD COLUMN "min_reading_ms" integer;--> statement-breakpoint
ALTER TABLE "answer_event" ADD COLUMN "hidden_return_ms" integer;--> statement-breakpoint
ALTER TABLE "answer_flag" ADD CONSTRAINT "answer_flag_answer_event_id_answer_event_id_fk" FOREIGN KEY ("answer_event_id") REFERENCES "public"."answer_event"("id") ON DELETE cascade ON UPDATE no action;