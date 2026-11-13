CREATE TYPE "public"."access_status" AS ENUM('not_requested', 'requested', 'granted', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."build_approach" AS ENUM('buy', 'configure', 'build', 'partner');--> statement-breakpoint
CREATE TYPE "public"."data_sensitivity" AS ENUM('public', 'internal', 'confidential', 'pii', 'phi', 'pci');--> statement-breakpoint
CREATE TYPE "public"."digest_frequency" AS ENUM('daily', 'weekly', 'off');--> statement-breakpoint
CREATE TYPE "public"."initiative_health" AS ENUM('on_track', 'at_risk', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."initiative_stage" AS ENUM('idea', 'evaluating', 'building', 'pilot', 'production', 'retired');--> statement-breakpoint
CREATE TYPE "public"."lead_status" AS ENUM('new', 'contacted', 'qualified', 'customer', 'disqualified');--> statement-breakpoint
CREATE TYPE "public"."metric_period" AS ENUM('monthly', 'annual', 'one_time');--> statement-breakpoint
CREATE TYPE "public"."metric_type" AS ENUM('hours_saved', 'cost_saved', 'revenue_generated', 'custom');--> statement-breakpoint
CREATE TYPE "public"."org_plan" AS ENUM('engagement', 'trial', 'pro', 'enterprise');--> statement-breakpoint
CREATE TYPE "public"."org_role" AS ENUM('owner', 'admin', 'editor', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."org_status" AS ENUM('active', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."platform_role" AS ENUM('user', 'consultant', 'admin');--> statement-breakpoint
CREATE TYPE "public"."source_type" AS ENUM('rss', 'sitemap');--> statement-breakpoint
CREATE TYPE "public"."story_status" AS ENUM('published', 'hidden');--> statement-breakpoint
CREATE TYPE "public"."system_category" AS ENUM('crm', 'erp', 'data_warehouse', 'database', 'document_store', 'hris', 'ticketing', 'communication', 'finance', 'marketing', 'custom_app', 'other');--> statement-breakpoint
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
CREATE TABLE "activity_log" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"initiative_id" text,
	"user_id" text,
	"action" text NOT NULL,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "articles" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"story_id" text,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"excerpt" text,
	"author" text,
	"published_at" timestamp with time zone NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "articles_url_unique" UNIQUE("url")
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" text PRIMARY KEY NOT NULL,
	"initiative_id" text NOT NULL,
	"user_id" text,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consultant_assignments" (
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consultant_assignments_org_id_user_id_pk" PRIMARY KEY("org_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "data_dependencies" (
	"id" text PRIMARY KEY NOT NULL,
	"initiative_id" text NOT NULL,
	"system_id" text NOT NULL,
	"data_description" text NOT NULL,
	"access_status" "access_status" DEFAULT 'not_requested' NOT NULL,
	"sensitivity" "data_sensitivity" DEFAULT 'internal' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "digests" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"story_ids" text[] NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "engagement_events" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"type" text NOT NULL,
	"story_id" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "impact_measurements" (
	"id" text PRIMARY KEY NOT NULL,
	"metric_id" text NOT NULL,
	"period_start" date NOT NULL,
	"value" double precision NOT NULL,
	"note" text,
	"recorded_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "impact_metrics" (
	"id" text PRIMARY KEY NOT NULL,
	"initiative_id" text NOT NULL,
	"type" "metric_type" NOT NULL,
	"name" text NOT NULL,
	"unit" text NOT NULL,
	"period" "metric_period" DEFAULT 'monthly' NOT NULL,
	"estimated_value" double precision,
	"hourly_rate" double precision,
	"assumptions" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "initiative_alerts" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"initiative_id" text NOT NULL,
	"story_id" text NOT NULL,
	"reason" text NOT NULL,
	"dismissed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "initiatives" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"title" text NOT NULL,
	"problem_statement" text DEFAULT '' NOT NULL,
	"proposed_solution" text DEFAULT '' NOT NULL,
	"business_unit" text,
	"sponsor" text,
	"owner_name" text,
	"stage" "initiative_stage" DEFAULT 'idea' NOT NULL,
	"health" "initiative_health" DEFAULT 'on_track' NOT NULL,
	"platforms" text[] DEFAULT '{}'::text[] NOT NULL,
	"models" text[] DEFAULT '{}'::text[] NOT NULL,
	"build_approach" "build_approach",
	"value_score" integer DEFAULT 3 NOT NULL,
	"feasibility_score" integer DEFAULT 3 NOT NULL,
	"alignment_score" integer DEFAULT 3 NOT NULL,
	"risk_score" integer DEFAULT 3 NOT NULL,
	"rank_override" integer,
	"estimated_build_cost" double precision,
	"estimated_annual_run_cost" double precision,
	"target_date" date,
	"launched_at" date,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_by_id" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"email" text NOT NULL,
	"role" "org_role" DEFAULT 'viewer' NOT NULL,
	"token" text NOT NULL,
	"invited_by_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "lead_profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"status" "lead_status" DEFAULT 'new' NOT NULL,
	"notes" text,
	"owner_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" "org_role" DEFAULT 'viewer' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_org_id_user_id_pk" PRIMARY KEY("org_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"industry" text,
	"plan" "org_plan" DEFAULT 'engagement' NOT NULL,
	"status" "org_status" DEFAULT 'active' NOT NULL,
	"default_hourly_rate" double precision DEFAULT 75 NOT NULL,
	"scoring_weights" jsonb DEFAULT '{"value":0.4,"feasibility":0.3,"alignment":0.2,"risk":0.1}'::jsonb NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"provisioned_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "saved_stories" (
	"user_id" text NOT NULL,
	"story_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_stories_user_id_story_id_pk" PRIMARY KEY("user_id","story_id")
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
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"homepage_url" text,
	"feed_url" text NOT NULL,
	"type" "source_type" DEFAULT 'rss' NOT NULL,
	"path_filter" text,
	"vendor" text,
	"default_category" text,
	"authority" integer DEFAULT 3 NOT NULL,
	"max_items_per_fetch" integer DEFAULT 25 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_fetched_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_error" text,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sources_feed_url_unique" UNIQUE("feed_url")
);
--> statement-breakpoint
CREATE TABLE "stories" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"why_it_matters" text,
	"categories" text[] DEFAULT '{}'::text[] NOT NULL,
	"vendors" text[] DEFAULT '{}'::text[] NOT NULL,
	"industries" text[] DEFAULT '{}'::text[] NOT NULL,
	"importance" integer DEFAULT 2 NOT NULL,
	"primary_url" text NOT NULL,
	"primary_source_name" text,
	"article_count" integer DEFAULT 1 NOT NULL,
	"status" "story_status" DEFAULT 'published' NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"classified_by" text DEFAULT 'heuristic' NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "systems" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"category" "system_category" DEFAULT 'other' NOT NULL,
	"vendor" text,
	"owner" text,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"platform_role" "platform_role" DEFAULT 'user' NOT NULL,
	"company" text,
	"job_title" text,
	"industry" text,
	"company_size" text,
	"onboarded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"categories" text[] DEFAULT '{}'::text[] NOT NULL,
	"vendors" text[] DEFAULT '{}'::text[] NOT NULL,
	"industries" text[] DEFAULT '{}'::text[] NOT NULL,
	"min_importance" integer DEFAULT 2 NOT NULL,
	"digest_frequency" "digest_frequency" DEFAULT 'weekly' NOT NULL,
	"last_digest_sent_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
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
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_initiative_id_initiatives_id_fk" FOREIGN KEY ("initiative_id") REFERENCES "public"."initiatives"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_initiative_id_initiatives_id_fk" FOREIGN KEY ("initiative_id") REFERENCES "public"."initiatives"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultant_assignments" ADD CONSTRAINT "consultant_assignments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultant_assignments" ADD CONSTRAINT "consultant_assignments_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_dependencies" ADD CONSTRAINT "data_dependencies_initiative_id_initiatives_id_fk" FOREIGN KEY ("initiative_id") REFERENCES "public"."initiatives"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_dependencies" ADD CONSTRAINT "data_dependencies_system_id_systems_id_fk" FOREIGN KEY ("system_id") REFERENCES "public"."systems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digests" ADD CONSTRAINT "digests_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_events" ADD CONSTRAINT "engagement_events_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_events" ADD CONSTRAINT "engagement_events_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impact_measurements" ADD CONSTRAINT "impact_measurements_metric_id_impact_metrics_id_fk" FOREIGN KEY ("metric_id") REFERENCES "public"."impact_metrics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impact_measurements" ADD CONSTRAINT "impact_measurements_recorded_by_id_user_id_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impact_metrics" ADD CONSTRAINT "impact_metrics_initiative_id_initiatives_id_fk" FOREIGN KEY ("initiative_id") REFERENCES "public"."initiatives"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "initiative_alerts" ADD CONSTRAINT "initiative_alerts_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "initiative_alerts" ADD CONSTRAINT "initiative_alerts_initiative_id_initiatives_id_fk" FOREIGN KEY ("initiative_id") REFERENCES "public"."initiatives"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "initiative_alerts" ADD CONSTRAINT "initiative_alerts_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "initiatives" ADD CONSTRAINT "initiatives_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "initiatives" ADD CONSTRAINT "initiatives_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_id_user_id_fk" FOREIGN KEY ("invited_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_profiles" ADD CONSTRAINT "lead_profiles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_profiles" ADD CONSTRAINT "lead_profiles_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_provisioned_by_id_user_id_fk" FOREIGN KEY ("provisioned_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_stories" ADD CONSTRAINT "saved_stories_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_stories" ADD CONSTRAINT "saved_stories_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "systems" ADD CONSTRAINT "systems_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "activity_org_idx" ON "activity_log" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "articles_story_idx" ON "articles" USING btree ("story_id");--> statement-breakpoint
CREATE INDEX "articles_unprocessed_idx" ON "articles" USING btree ("processed_at");--> statement-breakpoint
CREATE INDEX "comments_initiative_idx" ON "comments" USING btree ("initiative_id");--> statement-breakpoint
CREATE INDEX "data_deps_initiative_idx" ON "data_dependencies" USING btree ("initiative_id");--> statement-breakpoint
CREATE INDEX "data_deps_system_idx" ON "data_dependencies" USING btree ("system_id");--> statement-breakpoint
CREATE INDEX "engagement_user_idx" ON "engagement_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "engagement_created_idx" ON "engagement_events" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "impact_measurement_period_idx" ON "impact_measurements" USING btree ("metric_id","period_start");--> statement-breakpoint
CREATE INDEX "impact_metrics_initiative_idx" ON "impact_metrics" USING btree ("initiative_id");--> statement-breakpoint
CREATE UNIQUE INDEX "initiative_alert_unique_idx" ON "initiative_alerts" USING btree ("initiative_id","story_id");--> statement-breakpoint
CREATE INDEX "initiative_alerts_org_idx" ON "initiative_alerts" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "initiatives_org_idx" ON "initiatives" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "invitations_org_idx" ON "invitations" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "memberships_user_idx" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "stories_published_idx" ON "stories" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "stories_categories_idx" ON "stories" USING gin ("categories");--> statement-breakpoint
CREATE INDEX "stories_vendors_idx" ON "stories" USING gin ("vendors");--> statement-breakpoint
CREATE UNIQUE INDEX "systems_org_name_idx" ON "systems" USING btree ("org_id","name");