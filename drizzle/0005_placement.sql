CREATE TABLE "pseudoword" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "pseudoword_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"text" text NOT NULL,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pseudoword_text_unique" UNIQUE("text")
);
--> statement-breakpoint
CREATE TABLE "placement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"state" jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"result" jsonb
);
--> statement-breakpoint
CREATE TABLE "vocab_snapshot" (
	"user_id" text NOT NULL,
	"day" text NOT NULL,
	"size" integer NOT NULL,
	CONSTRAINT "vocab_snapshot_user_id_day_pk" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
ALTER TABLE "learner_profile" ADD COLUMN "placement_source" text;--> statement-breakpoint
ALTER TABLE "learner_profile" ADD COLUMN "placed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "learner_profile" ADD COLUMN "weekly_goal_minutes" integer DEFAULT 45 NOT NULL;--> statement-breakpoint
ALTER TABLE "learner_profile" ADD COLUMN "time_zone" text DEFAULT 'America/Chicago' NOT NULL;--> statement-breakpoint
ALTER TABLE "placement" ADD CONSTRAINT "placement_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocab_snapshot" ADD CONSTRAINT "vocab_snapshot_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;