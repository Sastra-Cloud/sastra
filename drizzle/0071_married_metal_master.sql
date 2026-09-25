ALTER TABLE "budget_approval_assignments" DROP CONSTRAINT "budget_approval_assignments_task_id_tasks_id_fk";
--> statement-breakpoint
ALTER TABLE "proposal_submissions" DROP CONSTRAINT "proposal_submissions_budget_approval_request_id_budget_approval_requests_id_fk";
--> statement-breakpoint
ALTER TABLE "budget_approval_assignments" ADD CONSTRAINT "budget_approval_assignments_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_submissions" ADD CONSTRAINT "proposal_submissions_budget_approval_request_id_budget_approval_requests_id_fk" FOREIGN KEY ("budget_approval_request_id") REFERENCES "public"."budget_approval_requests"("id") ON DELETE set null ON UPDATE no action;