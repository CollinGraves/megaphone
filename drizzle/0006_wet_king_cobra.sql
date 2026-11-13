CREATE TYPE "public"."approval_status" AS ENUM('not_submitted', 'pending', 'approved', 'conditional', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."human_oversight" AS ENUM('none', 'spot_check', 'review_all', 'human_decides');--> statement-breakpoint
CREATE TYPE "public"."idea_status" AS ENUM('new', 'under_review', 'accepted', 'declined', 'duplicate');--> statement-breakpoint
CREATE TYPE "public"."idea_urgency" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."risk_tier" AS ENUM('unclassified', 'minimal', 'limited', 'high', 'prohibited');--> statement-breakpoint
CREATE TABLE "assessments" (
	"id" text PRIMARY KEY NOT NULL,
	"claim_token" text NOT NULL,
	"user_id" text,
	"answers" jsonb NOT NULL,
	"context" jsonb NOT NULL,
	"scores" jsonb NOT NULL,
	"level" text NOT NULL,
	"org_id" text,
	"source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_at" timestamp with time zone,
	CONSTRAINT "assessments_claim_token_unique" UNIQUE("claim_token")
);
--> statement-breakpoint
CREATE TABLE "ideas" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"title" text NOT NULL,
	"problem" text NOT NULL,
	"desired_outcome" text,
	"department" text,
	"frequency" text,
	"people_affected" integer,
	"hours_per_week" double precision,
	"systems_involved" text,
	"urgency" "idea_urgency" DEFAULT 'medium' NOT NULL,
	"submitter_name" text NOT NULL,
	"submitter_email" text NOT NULL,
	"submitted_by_id" text,
	"channel" text DEFAULT 'workspace' NOT NULL,
	"status" "idea_status" DEFAULT 'new' NOT NULL,
	"triage_notes" text,
	"decline_reason" text,
	"triaged_by_id" text,
	"triaged_at" timestamp with time zone,
	"initiative_id" text,
	"duplicate_of_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "initiatives" ADD COLUMN "risk_tier" "risk_tier" DEFAULT 'unclassified' NOT NULL;--> statement-breakpoint
ALTER TABLE "initiatives" ADD COLUMN "customer_facing" boolean;--> statement-breakpoint
ALTER TABLE "initiatives" ADD COLUMN "affects_individuals" boolean;--> statement-breakpoint
ALTER TABLE "initiatives" ADD COLUMN "human_oversight" "human_oversight";--> statement-breakpoint
ALTER TABLE "initiatives" ADD COLUMN "approval_status" "approval_status" DEFAULT 'not_submitted' NOT NULL;--> statement-breakpoint
ALTER TABLE "initiatives" ADD COLUMN "approval_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "initiatives" ADD COLUMN "approval_requested_by_id" text;--> statement-breakpoint
ALTER TABLE "initiatives" ADD COLUMN "approval_decided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "initiatives" ADD COLUMN "approval_decided_by_id" text;--> statement-breakpoint
ALTER TABLE "initiatives" ADD COLUMN "approval_conditions" text;--> statement-breakpoint
ALTER TABLE "initiatives" ADD COLUMN "review_due_on" date;--> statement-breakpoint
ALTER TABLE "initiatives" ADD COLUMN "governance_notes" text;--> statement-breakpoint
ALTER TABLE "initiatives" ADD COLUMN "source_idea_id" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "governance_policy" jsonb DEFAULT '{"approvalRequiredStages":[],"reviewIntervalMonths":12}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "intake_token" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "intake_allowed_domains" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_submitted_by_id_user_id_fk" FOREIGN KEY ("submitted_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_triaged_by_id_user_id_fk" FOREIGN KEY ("triaged_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_initiative_id_initiatives_id_fk" FOREIGN KEY ("initiative_id") REFERENCES "public"."initiatives"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assessments_user_idx" ON "assessments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ideas_org_status_idx" ON "ideas" USING btree ("org_id","status");--> statement-breakpoint
ALTER TABLE "initiatives" ADD CONSTRAINT "initiatives_approval_requested_by_id_user_id_fk" FOREIGN KEY ("approval_requested_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "initiatives" ADD CONSTRAINT "initiatives_approval_decided_by_id_user_id_fk" FOREIGN KEY ("approval_decided_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_intake_token_unique" UNIQUE("intake_token");