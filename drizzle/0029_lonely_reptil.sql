CREATE TABLE "royalty_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"period" text NOT NULL,
	"amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"due_date" date,
	"recipient_email" text,
	"assignee_id" text,
	"task_id" uuid,
	"notes" text,
	"paid_at" timestamp,
	"paid_by" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recurring_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_by" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"project_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"assignee_id" text,
	"priority" "priority" DEFAULT 'medium' NOT NULL,
	"is_milestone" boolean DEFAULT false NOT NULL,
	"estimate_hours" numeric(6, 2),
	"frequency" text NOT NULL,
	"anchor_date" date NOT NULL,
	"end_date" date,
	"last_generated_date" date,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "source_recurring_task_id" uuid;--> statement-breakpoint
ALTER TABLE "project_budget_settings" ADD COLUMN "royalty_frequency" text DEFAULT 'annual' NOT NULL;--> statement-breakpoint
ALTER TABLE "project_budget_settings" ADD COLUMN "royalty_amount" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "project_budget_settings" ADD COLUMN "royalty_currency" text;--> statement-breakpoint
ALTER TABLE "royalty_payments" ADD CONSTRAINT "royalty_payments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "royalty_payments" ADD CONSTRAINT "royalty_payments_assignee_id_user_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "royalty_payments" ADD CONSTRAINT "royalty_payments_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "royalty_payments" ADD CONSTRAINT "royalty_payments_paid_by_user_id_fk" FOREIGN KEY ("paid_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "royalty_payments" ADD CONSTRAINT "royalty_payments_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_tasks" ADD CONSTRAINT "recurring_tasks_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_tasks" ADD CONSTRAINT "recurring_tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_tasks" ADD CONSTRAINT "recurring_tasks_assignee_id_user_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "royalty_payments_project_period_uq" ON "royalty_payments" USING btree ("project_id","period");--> statement-breakpoint
CREATE INDEX "royalty_payments_project_idx" ON "royalty_payments" USING btree ("project_id");