ALTER TABLE "tasks" ADD COLUMN "assigned_by" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "assigned_at" timestamp (3);--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "assignment_source" text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "assignment_deferred_at" timestamp (3);--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigned_by_user_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
-- Recover only corroborated original assignments. An original create activity
-- plus an assignment notification to the current owner is required. Later
-- assignment notifications and generated/source-managed tasks disqualify rows.
-- Unknown history stays unknown; task ownership, status, dates, and rank stay intact.
UPDATE "tasks" AS t
SET "assigned_by" = t."created_by",
    "assigned_at" = date_trunc('milliseconds', t."created_at"),
    "assignment_source" = 'direct'
FROM "user" AS creator
WHERE creator."id" = t."created_by"
  AND NOT creator."is_bot"
  AND t."assignment_source" = 'unknown'
  AND t."created_by" <> t."assigned_to"
  AND t."source_recurring_task_id" IS NULL
  AND t."source_task_template_id" IS NULL
  AND t."print_payment_id" IS NULL
  AND t."podcast_stage" IS NULL
  AND NOT t."lectio_managed"
  AND EXISTS (
    SELECT 1 FROM "activity_log" AS a
    WHERE a."entity_type" = 'task' AND a."entity_id" = t."id"::text
      AND a."action" = 'create' AND a."actor_id" = t."created_by"
  )
  AND EXISTS (
    SELECT 1 FROM "notifications" AS n
    WHERE n."type" = 'task_assigned' AND n."data"->>'taskId' = t."id"::text
      AND n."user_id" = t."assigned_to"
      AND n."created_at" BETWEEN t."created_at" AND t."created_at" + interval '5 minutes'
      AND NOT EXISTS (
        SELECT 1 FROM "notifications" AS later
        WHERE later."type" = 'task_assigned' AND later."data"->>'taskId' = t."id"::text
          AND later."created_at" > n."created_at"
      )
  )
  AND NOT EXISTS (SELECT 1 FROM "email_task_suggestions" AS e WHERE e."created_task_id" = t."id")
  AND NOT EXISTS (SELECT 1 FROM "budget_approval_assignments" AS b WHERE b."task_id" = t."id")
  AND NOT EXISTS (SELECT 1 FROM "royalty_payments" AS r WHERE r."task_id" = t."id")
  AND NOT EXISTS (SELECT 1 FROM "license_fee_payments" AS l WHERE l."task_id" = t."id")
  AND NOT EXISTS (SELECT 1 FROM "mou_payments" AS m WHERE m."invoice_task_id" = t."id");
