CREATE TABLE "budget_approval_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"approver_id" text NOT NULL,
	"task_id" uuid NOT NULL,
	"decision" text DEFAULT 'pending' NOT NULL,
	"change_note" text,
	"decided_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budget_approval_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"requester_id" text NOT NULL,
	"due_date" date NOT NULL,
	"fingerprint" text NOT NULL,
	"currency" text NOT NULL,
	"total_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"superseded_from_status" text,
	"approved_at" timestamp,
	"superseded_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "proposal_submissions" ADD COLUMN "budget_approval_request_id" uuid;--> statement-breakpoint
ALTER TABLE "proposal_submissions" ADD COLUMN "budget_approval_fingerprint" text;--> statement-breakpoint
ALTER TABLE "budget_approval_assignments" ADD CONSTRAINT "budget_approval_assignments_request_id_budget_approval_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."budget_approval_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_approval_assignments" ADD CONSTRAINT "budget_approval_assignments_approver_id_user_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_approval_assignments" ADD CONSTRAINT "budget_approval_assignments_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_approval_requests" ADD CONSTRAINT "budget_approval_requests_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_approval_requests" ADD CONSTRAINT "budget_approval_requests_requester_id_user_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "budget_approval_assignments_request_approver_uq" ON "budget_approval_assignments" USING btree ("request_id","approver_id");--> statement-breakpoint
CREATE UNIQUE INDEX "budget_approval_assignments_task_uq" ON "budget_approval_assignments" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "budget_approval_assignments_approver_idx" ON "budget_approval_assignments" USING btree ("approver_id");--> statement-breakpoint
CREATE INDEX "budget_approval_requests_project_idx" ON "budget_approval_requests" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "budget_approval_requests_current_project_uq" ON "budget_approval_requests" USING btree ("project_id") WHERE "budget_approval_requests"."status" <> 'superseded';--> statement-breakpoint
ALTER TABLE "proposal_submissions" ADD CONSTRAINT "proposal_submissions_budget_approval_request_id_budget_approval_requests_id_fk" FOREIGN KEY ("budget_approval_request_id") REFERENCES "public"."budget_approval_requests"("id") ON DELETE restrict ON UPDATE no action;