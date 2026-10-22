CREATE TABLE "demo_account" (
	"user_id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_at" timestamp with time zone,
	CONSTRAINT "demo_account_kind" CHECK ("demo_account"."kind" IN ('learner', 'teacher'))
);
--> statement-breakpoint
ALTER TABLE "demo_account" ADD CONSTRAINT "demo_account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "demo_account_pool_idx" ON "demo_account" USING btree ("kind","claimed_at");