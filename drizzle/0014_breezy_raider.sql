CREATE TABLE "project_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"snap_date" date NOT NULL,
	"health_status" text,
	"total_tasks" integer DEFAULT 0 NOT NULL,
	"done_tasks" integer DEFAULT 0 NOT NULL,
	"blocker_count" integer DEFAULT 0 NOT NULL,
	"critical_blocker_count" integer DEFAULT 0 NOT NULL,
	"budget_needed" numeric(14, 2) DEFAULT '0' NOT NULL,
	"budget_secured" numeric(14, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_snapshots" ADD CONSTRAINT "project_snapshots_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_snapshots_uq" ON "project_snapshots" USING btree ("project_id","snap_date");