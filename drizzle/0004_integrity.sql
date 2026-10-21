CREATE TABLE "active_time" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "active_time_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" text NOT NULL,
	"study_session_id" uuid NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"ms" integer NOT NULL,
	CONSTRAINT "active_time_ms" CHECK ("active_time"."ms" >= 0)
);
--> statement-breakpoint
CREATE TABLE "answer_flag" (
	"answer_event_id" bigint PRIMARY KEY NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "answer_flag_reason" CHECK ("answer_flag"."reason" IN ('fast', 'same_position', 'hidden_tab'))
);
--> statement-breakpoint
ALTER TABLE "answer_event" ADD COLUMN "min_reading_ms" integer;--> statement-breakpoint
ALTER TABLE "answer_event" ADD COLUMN "hidden_return_ms" integer;--> statement-breakpoint
ALTER TABLE "active_time" ADD CONSTRAINT "active_time_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "active_time" ADD CONSTRAINT "active_time_study_session_id_study_session_id_fk" FOREIGN KEY ("study_session_id") REFERENCES "public"."study_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answer_flag" ADD CONSTRAINT "answer_flag_answer_event_id_answer_event_id_fk" FOREIGN KEY ("answer_event_id") REFERENCES "public"."answer_event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "active_time_user_at_idx" ON "active_time" USING btree ("user_id","at");