CREATE TABLE "workspace_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"month" text NOT NULL,
	"data" jsonb NOT NULL,
	"summary" text NOT NULL,
	"generator" text NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "monthly_report" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_reports" ADD CONSTRAINT "workspace_reports_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_reports_org_month_idx" ON "workspace_reports" USING btree ("org_id","month");--> statement-breakpoint
ALTER TABLE "workspace_reports" ENABLE ROW LEVEL SECURITY;
