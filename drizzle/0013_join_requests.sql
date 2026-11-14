CREATE TYPE "public"."join_request_status" AS ENUM('pending', 'approved', 'declined', 'cancelled');--> statement-breakpoint
CREATE TABLE "workspace_join_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"message" text,
	"status" "join_request_status" DEFAULT 'pending' NOT NULL,
	"granted_role" "org_role",
	"decided_by_id" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "email_domain" text;--> statement-breakpoint
ALTER TABLE "workspace_join_requests" ADD CONSTRAINT "workspace_join_requests_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_join_requests" ADD CONSTRAINT "workspace_join_requests_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_join_requests" ADD CONSTRAINT "workspace_join_requests_decided_by_id_user_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "join_requests_one_pending_idx" ON "workspace_join_requests" USING btree ("org_id","user_id") WHERE "workspace_join_requests"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "join_requests_org_status_idx" ON "workspace_join_requests" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "organizations_email_domain_idx" ON "organizations" USING btree ("email_domain");--> statement-breakpoint
UPDATE "organizations" o SET "email_domain" = (
  SELECT u."company_domain" FROM "memberships" m JOIN "user" u ON u."id" = m."user_id"
  WHERE m."org_id" = o."id" AND m."role" = 'owner' AND u."company_domain" IS NOT NULL
  ORDER BY m."created_at" LIMIT 1
) WHERE o."email_domain" IS NULL;
