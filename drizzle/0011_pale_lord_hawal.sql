CREATE TYPE "public"."brief_status" AS ENUM('generating', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."build_update_status" AS ENUM('planned', 'in_progress', 'blocked', 'done');--> statement-breakpoint
CREATE TABLE "build_briefs" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"initiative_id" text NOT NULL,
	"version" integer NOT NULL,
	"status" "brief_status" DEFAULT 'generating' NOT NULL,
	"content" jsonb,
	"generator" text,
	"error" text,
	"guidance" text,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "build_updates" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"initiative_id" text NOT NULL,
	"status" "build_update_status" NOT NULL,
	"message" text NOT NULL,
	"link" text,
	"source" text DEFAULT 'app' NOT NULL,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "build_briefs" ADD CONSTRAINT "build_briefs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "build_briefs" ADD CONSTRAINT "build_briefs_initiative_id_initiatives_id_fk" FOREIGN KEY ("initiative_id") REFERENCES "public"."initiatives"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "build_briefs" ADD CONSTRAINT "build_briefs_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "build_updates" ADD CONSTRAINT "build_updates_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "build_updates" ADD CONSTRAINT "build_updates_initiative_id_initiatives_id_fk" FOREIGN KEY ("initiative_id") REFERENCES "public"."initiatives"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "build_updates" ADD CONSTRAINT "build_updates_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "build_briefs_version_idx" ON "build_briefs" USING btree ("initiative_id","version");--> statement-breakpoint
CREATE INDEX "build_briefs_org_idx" ON "build_briefs" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "build_updates_initiative_idx" ON "build_updates" USING btree ("initiative_id","created_at");