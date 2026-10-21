CREATE TABLE "answer_event" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "answer_event_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"client_answer_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"sense_id" integer NOT NULL,
	"example_id" integer,
	"study_session_id" uuid NOT NULL,
	"question_type" text NOT NULL,
	"card_kind" text,
	"options" jsonb,
	"chosen_index" smallint,
	"typed_text" varchar(40),
	"dont_know" boolean DEFAULT false NOT NULL,
	"grade" text NOT NULL,
	"grade_reason" text,
	"correct" boolean NOT NULL,
	"rating" smallint,
	"is_pretest" boolean DEFAULT false NOT NULL,
	"fsrs_before" jsonb,
	"fsrs_after" jsonb,
	"fsrs_params_version" text NOT NULL,
	"client_response_ms" integer NOT NULL,
	"server_issued_at" timestamp with time zone NOT NULL,
	"server_received_at" timestamp with time zone NOT NULL,
	"flagged" boolean DEFAULT false NOT NULL,
	"app_version" text NOT NULL,
	CONSTRAINT "answer_event_client_answer_id_unique" UNIQUE("client_answer_id"),
	CONSTRAINT "answer_event_typed_len" CHECK (char_length("answer_event"."typed_text") <= 40)
);
--> statement-breakpoint
CREATE TABLE "card" (
	"user_id" text NOT NULL,
	"sense_id" integer NOT NULL,
	"kind" text NOT NULL,
	"due" timestamp with time zone NOT NULL,
	"stability" real NOT NULL,
	"difficulty" real NOT NULL,
	"elapsed_days" real NOT NULL,
	"scheduled_days" real NOT NULL,
	"learning_steps" integer NOT NULL,
	"reps" integer NOT NULL,
	"lapses" integer NOT NULL,
	"state" smallint NOT NULL,
	"last_review" timestamp with time zone,
	CONSTRAINT "card_user_id_sense_id_kind_pk" PRIMARY KEY("user_id","sense_id","kind"),
	CONSTRAINT "card_kind" CHECK ("card"."kind" IN ('recognition', 'production'))
);
--> statement-breakpoint
CREATE TABLE "issued_question" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"study_session_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"answered_at" timestamp with time zone,
	"client_answer_id" uuid,
	"response" jsonb,
	CONSTRAINT "issued_question_client_answer_id_unique" UNIQUE("client_answer_id")
);
--> statement-breakpoint
CREATE TABLE "learner_profile" (
	"user_id" text PRIMARY KEY NOT NULL,
	"ability" real NOT NULL,
	"ability_answers" integer DEFAULT 0 NOT NULL,
	"start_level" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sense_progress" (
	"user_id" text NOT NULL,
	"sense_id" integer NOT NULL,
	"best_recognition_pass_days" real DEFAULT 0 NOT NULL,
	"last_question_type" text,
	"introduced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sense_progress_user_id_sense_id_pk" PRIMARY KEY("user_id","sense_id")
);
--> statement-breakpoint
CREATE TABLE "study_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"planned_minutes" integer NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"active_ms" integer DEFAULT 0 NOT NULL,
	"state" jsonb NOT NULL,
	"audio" boolean NOT NULL
);
--> statement-breakpoint
ALTER TABLE "answer_event" ADD CONSTRAINT "answer_event_sense_id_sense_id_fk" FOREIGN KEY ("sense_id") REFERENCES "public"."sense"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answer_event" ADD CONSTRAINT "answer_event_example_id_example_id_fk" FOREIGN KEY ("example_id") REFERENCES "public"."example"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answer_event" ADD CONSTRAINT "answer_event_study_session_id_study_session_id_fk" FOREIGN KEY ("study_session_id") REFERENCES "public"."study_session"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card" ADD CONSTRAINT "card_sense_id_sense_id_fk" FOREIGN KEY ("sense_id") REFERENCES "public"."sense"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issued_question" ADD CONSTRAINT "issued_question_study_session_id_study_session_id_fk" FOREIGN KEY ("study_session_id") REFERENCES "public"."study_session"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sense_progress" ADD CONSTRAINT "sense_progress_sense_id_sense_id_fk" FOREIGN KEY ("sense_id") REFERENCES "public"."sense"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "answer_event_user_idx" ON "answer_event" USING btree ("user_id","server_received_at");--> statement-breakpoint
CREATE INDEX "answer_event_sense_idx" ON "answer_event" USING btree ("sense_id");--> statement-breakpoint
CREATE INDEX "card_user_due_idx" ON "card" USING btree ("user_id","due");--> statement-breakpoint
CREATE INDEX "issued_question_session_idx" ON "issued_question" USING btree ("study_session_id");--> statement-breakpoint
CREATE INDEX "study_session_user_idx" ON "study_session" USING btree ("user_id","started_at");
--> statement-breakpoint
-- Hand-written: answer_event is append-only. The only allowed update clears typed_text
-- (raw typed answers are dropped after 90 days); deletes happen only with the account.
CREATE FUNCTION "answer_event_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.typed_text IS NULL AND (to_jsonb(NEW) - 'typed_text') = (to_jsonb(OLD) - 'typed_text') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'answer_event is append-only; only typed_text may be cleared';
END $$;
--> statement-breakpoint
CREATE TRIGGER "answer_event_no_update" BEFORE UPDATE ON "answer_event"
  FOR EACH ROW EXECUTE FUNCTION "answer_event_append_only"();
