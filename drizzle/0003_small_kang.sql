CREATE TYPE "public"."enrichment_status" AS ENUM('pending', 'requested', 'enriched', 'failed');--> statement-breakpoint
CREATE TABLE "companies" (
	"domain" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"website" text,
	"industry" text,
	"employee_count" integer,
	"size_range" text,
	"headquarters" text,
	"linkedin_url" text,
	"description" text,
	"enrichment_status" "enrichment_status" DEFAULT 'pending' NOT NULL,
	"enrichment_source" text,
	"enrichment_requested_at" timestamp with time zone,
	"enriched_at" timestamp with time zone,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_contacts" (
	"id" text PRIMARY KEY NOT NULL,
	"domain" text NOT NULL,
	"full_name" text NOT NULL,
	"title" text,
	"email" text,
	"linkedin_url" text,
	"source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "company_domain" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "referred_by_id" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "signup_source" text;--> statement-breakpoint
ALTER TABLE "company_contacts" ADD CONSTRAINT "company_contacts_domain_companies_domain_fk" FOREIGN KEY ("domain") REFERENCES "public"."companies"("domain") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "company_contacts_unique_idx" ON "company_contacts" USING btree ("domain","full_name");