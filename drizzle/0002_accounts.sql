-- Hand-written: learner rows from before accounts belonged to the Phase 3 dev user, which
-- has no user row. Production never had any; clear them so the foreign keys below can be added.
DELETE FROM "answer_event";--> statement-breakpoint
DELETE FROM "issued_question";--> statement-breakpoint
DELETE FROM "study_session";--> statement-breakpoint
DELETE FROM "card";--> statement-breakpoint
DELETE FROM "sense_progress";--> statement-breakpoint
DELETE FROM "learner_profile";--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token"),
	CONSTRAINT "session_no_ip_or_agent" CHECK ("session"."ip_address" IS NULL AND "session"."user_agent" IS NULL)
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"username" text,
	"display_username" text,
	"role" text DEFAULT 'learner' NOT NULL,
	"age_confirmed_at" timestamp with time zone,
	"scheduled_deletion_at" timestamp with time zone,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_username_unique" UNIQUE("username"),
	CONSTRAINT "user_role" CHECK ("user"."role" IN ('teacher', 'student', 'learner', 'admin')),
	CONSTRAINT "user_student_no_pii" CHECK ("user"."role" <> 'student' OR ("user"."email" LIKE '%@students.invalid' AND "user"."image" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_action_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action" text NOT NULL,
	"target" text NOT NULL,
	"detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "classroom" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"teacher_id" text NOT NULL,
	"name" text NOT NULL,
	"weekly_goal_minutes" integer DEFAULT 45 NOT NULL,
	"week_reset_day" smallint DEFAULT 0 NOT NULL,
	"week_reset_time" text DEFAULT '23:59' NOT NULL,
	"time_zone" text DEFAULT 'America/Chicago' NOT NULL,
	"session_minutes" integer DEFAULT 15 NOT NULL,
	"focus_list_id" integer,
	"grade_goal_weight" real DEFAULT 1 NOT NULL,
	"grade_accuracy_weight" real DEFAULT 0 NOT NULL,
	"grade_flagged_deduction" real DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "classroom_goal" CHECK ("classroom"."weekly_goal_minutes" BETWEEN 1 AND 10000),
	CONSTRAINT "classroom_session" CHECK ("classroom"."session_minutes" BETWEEN 1 AND 60)
);
--> statement-breakpoint
CREATE TABLE "seat" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"classroom_id" uuid NOT NULL,
	"seat_number" integer NOT NULL,
	"student_id" text,
	"code" text,
	"code_kind" text,
	"joined_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seat_code_unique" UNIQUE("code"),
	CONSTRAINT "seat_classroom_number" UNIQUE("classroom_id","seat_number"),
	CONSTRAINT "seat_number_positive" CHECK ("seat"."seat_number" >= 1),
	CONSTRAINT "seat_code_kind" CHECK (("seat"."code" IS NULL) = ("seat"."code_kind" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classroom" ADD CONSTRAINT "classroom_teacher_id_user_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classroom" ADD CONSTRAINT "classroom_focus_list_id_word_list_id_fk" FOREIGN KEY ("focus_list_id") REFERENCES "public"."word_list"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat" ADD CONSTRAINT "seat_classroom_id_classroom_id_fk" FOREIGN KEY ("classroom_id") REFERENCES "public"."classroom"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat" ADD CONSTRAINT "seat_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "classroom_teacher_idx" ON "classroom" USING btree ("teacher_id");--> statement-breakpoint
CREATE INDEX "seat_student_idx" ON "seat" USING btree ("student_id");--> statement-breakpoint
ALTER TABLE "answer_event" ADD CONSTRAINT "answer_event_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card" ADD CONSTRAINT "card_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issued_question" ADD CONSTRAINT "issued_question_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner_profile" ADD CONSTRAINT "learner_profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sense_progress" ADD CONSTRAINT "sense_progress_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_session" ADD CONSTRAINT "study_session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;