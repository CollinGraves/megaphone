CREATE TYPE "public"."entity_kind" AS ENUM('vendor', 'product', 'model', 'company', 'regulation');--> statement-breakpoint
CREATE TYPE "public"."fact_predicate" AS ENUM('price', 'retires_on', 'deprecated_on', 'effective_on', 'available_on', 'adopted', 'supersedes');--> statement-breakpoint
CREATE TYPE "public"."stack_status" AS ENUM('inferred', 'confirmed', 'rejected');--> statement-breakpoint
CREATE TABLE "company_stack" (
	"domain" text NOT NULL,
	"entity_id" text NOT NULL,
	"source" text NOT NULL,
	"confidence" double precision DEFAULT 0.5 NOT NULL,
	"status" "stack_status" DEFAULT 'inferred' NOT NULL,
	"reviewed_by_id" text,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_to" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_stack_domain_entity_id_pk" PRIMARY KEY("domain","entity_id")
);
--> statement-breakpoint
CREATE TABLE "entities" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" "entity_kind" NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"vendor_slug" text,
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_facts" (
	"id" text PRIMARY KEY NOT NULL,
	"subject_id" text NOT NULL,
	"predicate" "fact_predicate" NOT NULL,
	"object_id" text,
	"value" text,
	"valid_from" date,
	"valid_to" date,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"story_id" text,
	"superseded_by_id" text
);
--> statement-breakpoint
CREATE TABLE "story_entities" (
	"story_id" text NOT NULL,
	"entity_id" text NOT NULL,
	CONSTRAINT "story_entities_story_id_entity_id_pk" PRIMARY KEY("story_id","entity_id")
);
--> statement-breakpoint
CREATE TABLE "story_links" (
	"story_id" text NOT NULL,
	"related_story_id" text NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "story_links_story_id_related_story_id_pk" PRIMARY KEY("story_id","related_story_id")
);
--> statement-breakpoint
ALTER TABLE "company_stack" ADD CONSTRAINT "company_stack_domain_companies_domain_fk" FOREIGN KEY ("domain") REFERENCES "public"."companies"("domain") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_stack" ADD CONSTRAINT "company_stack_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_stack" ADD CONSTRAINT "company_stack_reviewed_by_id_user_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_facts" ADD CONSTRAINT "entity_facts_subject_id_entities_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_facts" ADD CONSTRAINT "entity_facts_object_id_entities_id_fk" FOREIGN KEY ("object_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_facts" ADD CONSTRAINT "entity_facts_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_entities" ADD CONSTRAINT "story_entities_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_entities" ADD CONSTRAINT "story_entities_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_links" ADD CONSTRAINT "story_links_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_links" ADD CONSTRAINT "story_links_related_story_id_stories_id_fk" FOREIGN KEY ("related_story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "entities_kind_slug_idx" ON "entities" USING btree ("kind","slug");--> statement-breakpoint
CREATE INDEX "entities_vendor_idx" ON "entities" USING btree ("vendor_slug");--> statement-breakpoint
CREATE INDEX "entity_facts_subject_idx" ON "entity_facts" USING btree ("subject_id","predicate");--> statement-breakpoint
CREATE INDEX "entity_facts_valid_from_idx" ON "entity_facts" USING btree ("valid_from");--> statement-breakpoint
CREATE INDEX "story_entities_entity_idx" ON "story_entities" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "story_links_related_idx" ON "story_links" USING btree ("related_story_id");