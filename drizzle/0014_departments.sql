CREATE TYPE "public"."department_role" AS ENUM('lead', 'member');--> statement-breakpoint
CREATE TYPE "public"."department_visibility" AS ENUM('open', 'private');--> statement-breakpoint
CREATE TABLE "department_members" (
	"department_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" "department_role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "department_members_department_id_user_id_pk" PRIMARY KEY("department_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"visibility" "department_visibility" DEFAULT 'open' NOT NULL,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ideas" ADD COLUMN "department_id" text;--> statement-breakpoint
ALTER TABLE "initiatives" ADD COLUMN "department_id" text;--> statement-breakpoint
ALTER TABLE "department_members" ADD CONSTRAINT "department_members_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "department_members" ADD CONSTRAINT "department_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "departments" ADD CONSTRAINT "departments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "departments" ADD CONSTRAINT "departments_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "department_members_user_idx" ON "department_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "departments_org_slug_idx" ON "departments" USING btree ("org_id","slug");--> statement-breakpoint
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "initiatives" ADD CONSTRAINT "initiatives_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ideas_department_idx" ON "ideas" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "initiatives_department_idx" ON "initiatives" USING btree ("department_id");--> statement-breakpoint
ALTER TABLE "departments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "department_members" ENABLE ROW LEVEL SECURITY;
