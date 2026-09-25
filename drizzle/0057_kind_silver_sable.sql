ALTER TABLE "license_obligations" ADD COLUMN "first_due_date" date;

-- Existing annual compliance reminders were previously anchored to the
-- agreement-signing anniversary. Move only recognizably generated defaults to
-- January 31 in the same reporting year. A manager-entered or agreement-stated
-- date that does not match that old default is intentionally left untouched.
UPDATE "tasks" AS "task"
SET
  "due_date" = make_date(extract(year from "rule"."anchor_date")::integer, 1, 31),
  "updated_at" = now()
FROM "recurring_tasks" AS "rule"
JOIN "license_obligations" AS "obligation"
  ON "obligation"."recurring_task_id" = "rule"."id"
JOIN "rights_items" AS "rights"
  ON "rights"."project_id" = "obligation"."project_id"
WHERE "task"."source_recurring_task_id" = "rule"."id"
  AND "obligation"."cadence" = 'annual'
  AND "obligation"."first_due_date" IS NULL
  AND "rule"."anchor_date" = (
    coalesce(
      "rights"."license_signed_date",
      "rights"."mou_signed_date",
      "rights"."rights_start_date"
    ) + interval '1 year'
  )::date
  AND "task"."due_date_is_manual" = false
  AND "task"."status" <> 'done';

UPDATE "recurring_tasks" AS "rule"
SET
  "anchor_date" = make_date(extract(year from "rule"."anchor_date")::integer, 1, 31),
  "last_generated_date" = CASE
    WHEN "rule"."last_generated_date" = "rule"."anchor_date"
      THEN make_date(extract(year from "rule"."anchor_date")::integer, 1, 31)
    ELSE "rule"."last_generated_date"
  END,
  "updated_at" = now()
FROM "license_obligations" AS "obligation"
JOIN "rights_items" AS "rights"
  ON "rights"."project_id" = "obligation"."project_id"
WHERE "obligation"."recurring_task_id" = "rule"."id"
  AND "obligation"."cadence" = 'annual'
  AND "obligation"."first_due_date" IS NULL
  AND "rule"."anchor_date" = (
    coalesce(
      "rights"."license_signed_date",
      "rights"."mou_signed_date",
      "rights"."rights_start_date"
    ) + interval '1 year'
  )::date;
