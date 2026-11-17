CREATE TYPE "public"."cost_connection_status" AS ENUM('active', 'error');--> statement-breakpoint
CREATE TYPE "public"."cost_provider" AS ENUM('openai', 'anthropic', 'microsoft');--> statement-breakpoint
CREATE TABLE "cost_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"provider" "cost_provider" NOT NULL,
	"status" "cost_connection_status" DEFAULT 'active' NOT NULL,
	"label" text,
	"secret" text,
	"secret_hint" text,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_synced_at" timestamp with time zone,
	"last_error" text,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cost_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"connection_id" text NOT NULL,
	"day" date NOT NULL,
	"dimension_key" text NOT NULL,
	"dimension_name" text,
	"line_item" text DEFAULT '' NOT NULL,
	"amount_usd" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cost_mappings" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"connection_id" text NOT NULL,
	"dimension_key" text NOT NULL,
	"initiative_id" text,
	"ignored" boolean DEFAULT false NOT NULL,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cost_connections" ADD CONSTRAINT "cost_connections_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_connections" ADD CONSTRAINT "cost_connections_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_lines" ADD CONSTRAINT "cost_lines_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_lines" ADD CONSTRAINT "cost_lines_connection_id_cost_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."cost_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_mappings" ADD CONSTRAINT "cost_mappings_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_mappings" ADD CONSTRAINT "cost_mappings_connection_id_cost_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."cost_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_mappings" ADD CONSTRAINT "cost_mappings_initiative_id_initiatives_id_fk" FOREIGN KEY ("initiative_id") REFERENCES "public"."initiatives"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_mappings" ADD CONSTRAINT "cost_mappings_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cost_connections_org_provider_idx" ON "cost_connections" USING btree ("org_id","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "cost_lines_unique_idx" ON "cost_lines" USING btree ("connection_id","day","dimension_key","line_item");--> statement-breakpoint
CREATE INDEX "cost_lines_org_day_idx" ON "cost_lines" USING btree ("org_id","day");--> statement-breakpoint
CREATE UNIQUE INDEX "cost_mappings_dimension_idx" ON "cost_mappings" USING btree ("connection_id","dimension_key");--> statement-breakpoint
ALTER TABLE "cost_connections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cost_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cost_mappings" ENABLE ROW LEVEL SECURITY;
