ALTER TYPE "public"."org_plan" ADD VALUE 'team';--> statement-breakpoint
ALTER TYPE "public"."org_plan" ADD VALUE 'business';--> statement-breakpoint
CREATE TABLE "stripe_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "subscription_status" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "billing_interval" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "current_period_end" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "cancel_at_period_end" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "created_by_id" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "onboarding_dismissed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;