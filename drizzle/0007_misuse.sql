CREATE TABLE "misuse" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "misuse_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"sense_id" integer NOT NULL,
	"position" integer NOT NULL,
	"text" text NOT NULL,
	"explanation" text NOT NULL,
	"source" "content_source" NOT NULL,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "misuse_sense_position" UNIQUE("sense_id","position")
);
--> statement-breakpoint
ALTER TABLE "misuse" ADD CONSTRAINT "misuse_sense_id_sense_id_fk" FOREIGN KEY ("sense_id") REFERENCES "public"."sense"("id") ON DELETE no action ON UPDATE no action;