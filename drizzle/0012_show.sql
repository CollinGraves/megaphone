CREATE TYPE "public"."episode_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TABLE "episodes" (
	"id" text PRIMARY KEY NOT NULL,
	"number" integer NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"air_date" date NOT NULL,
	"status" "episode_status" DEFAULT 'draft' NOT NULL,
	"prep_status" text DEFAULT 'ready' NOT NULL,
	"prep_error" text,
	"rundown" jsonb,
	"show_notes" text,
	"video_url" text,
	"story_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	CONSTRAINT "episodes_number_unique" UNIQUE("number"),
	CONSTRAINT "episodes_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "share_aggregate_insights" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "episodes" ADD CONSTRAINT "episodes_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "episodes_status_air_idx" ON "episodes" USING btree ("status","air_date");--> statement-breakpoint
CREATE INDEX "episodes_story_ids_idx" ON "episodes" USING gin ("story_ids");