UPDATE "projects"
SET
  "video_production_mode" = COALESCE("video_production_mode", 'original'),
  "video_required" = true
WHERE "kind" = 'video_series';--> statement-breakpoint

UPDATE "units" u
SET "video_required_override" = NULL
FROM "projects" p
WHERE p."id" = u."project_id" AND p."kind" = 'video_series';--> statement-breakpoint

-- Legacy configurable capacity groups did not know about video series. Put the
-- kind beside article/podcast work while retaining names, staffing, keys, and
-- all other administrator customizations.
WITH target_groups AS (
  SELECT
    ws."id",
    COALESCE(
      (
        SELECT elem.ordinality - 1
        FROM jsonb_array_elements(ws."capacity_groups") WITH ORDINALITY elem(value, ordinality)
        ORDER BY
          CASE
            WHEN elem.value->'kinds' ? 'article' AND elem.value->'kinds' ? 'podcast' THEN 0
            WHEN elem.value->'kinds' ? 'podcast' THEN 1
            WHEN elem.value->'kinds' ? 'article' THEN 2
            WHEN elem.value->'kinds' ? 'other' THEN 3
            ELSE 4
          END,
          elem.ordinality
        LIMIT 1
      ),
      0
    )::int AS group_index
  FROM "workspace_settings" ws
  WHERE jsonb_array_length(ws."capacity_groups") > 0
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(ws."capacity_groups") elem(value)
      WHERE elem.value->'kinds' ? 'video_series'
    )
)
UPDATE "workspace_settings" ws
SET "capacity_groups" = jsonb_set(
  ws."capacity_groups",
  ARRAY[target_groups.group_index::text, 'kinds'],
  (ws."capacity_groups"->target_groups.group_index->'kinds') || '"video_series"'::jsonb
)
FROM target_groups
WHERE ws."id" = target_groups."id";--> statement-breakpoint

DROP TABLE IF EXISTS "_migration_0096_video_obsolete_stage_tasks";--> statement-breakpoint
CREATE TABLE "_migration_0096_video_obsolete_stage_tasks" AS
SELECT
  t."id",
  (
    t."status" = 'todo'
    AND t."priority" = 'medium'
    AND t."assigned_to" IS NULL
    AND t."description" IS NULL
    AND t."estimate_hours" IS NULL
    AND t."order_index" = 0
    AND t."rank" = 0
    AND t."due_date_is_manual" = false
    AND t."completed_at" IS NULL
    AND t."drive_folder_id" IS NULL
    AND t."drive_folder_name" IS NULL
    AND t."drive_folder_url" IS NULL
    AND t."phase_id" IS NULL
    AND t."is_milestone" = false
    AND t."print_run_id" IS NULL
    AND t."print_payment_id" IS NULL
    AND t."source_task_template_id" IS NULL
    AND t."source_recurring_task_id" IS NULL
    AND t."title" = u."name" || ': ' || CASE t."podcast_stage"
      WHEN 'translate_script' THEN 'Translate script'
      WHEN 'approve_translation' THEN 'Edit and approve translation'
      WHEN 'record_audio' THEN 'Record audio'
      WHEN 'master_audio' THEN 'Edit and master audio'
    END
    AND NOT EXISTS (SELECT 1 FROM "task_comments" tc WHERE tc."task_id" = t."id")
    AND NOT EXISTS (SELECT 1 FROM "task_drive_files" tdf WHERE tdf."task_id" = t."id")
    AND NOT EXISTS (SELECT 1 FROM "time_entries" te WHERE te."task_id" = t."id")
    AND NOT EXISTS (
      SELECT 1 FROM "file_attachments" fa
      WHERE fa."target_type" = 'task' AND fa."target_id" = t."id"
    )
  ) AS pristine
FROM "tasks" t
INNER JOIN "projects" p ON p."id" = t."project_id"
INNER JOIN "units" u ON u."id" = t."unit_id"
WHERE p."kind" = 'video_series'
  AND t."podcast_stage" IN (
    'translate_script',
    'approve_translation',
    'record_audio',
    'master_audio'
  );--> statement-breakpoint

DELETE FROM "task_dependencies"
WHERE "task_id" IN (SELECT "id" FROM "_migration_0096_video_obsolete_stage_tasks")
   OR "depends_on_task_id" IN (SELECT "id" FROM "_migration_0096_video_obsolete_stage_tasks");--> statement-breakpoint

DELETE FROM "tasks"
WHERE "id" IN (
  SELECT "id" FROM "_migration_0096_video_obsolete_stage_tasks" WHERE "pristine" = true
);--> statement-breakpoint

UPDATE "tasks"
SET "podcast_stage" = NULL, "updated_at" = now()
WHERE "id" IN (
  SELECT "id" FROM "_migration_0096_video_obsolete_stage_tasks" WHERE "pristine" = false
);--> statement-breakpoint

INSERT INTO "tasks" (
  "project_id",
  "unit_id",
  "podcast_stage",
  "title",
  "status",
  "priority",
  "assigned_to",
  "due_date",
  "due_date_is_manual",
  "created_by"
)
SELECT
  p."id",
  u."id",
  stage.stage::podcast_stage,
  u."name" || ': ' || stage.label,
  CASE WHEN u."status" = 'draft' THEN 'todo'::task_status ELSE 'done'::task_status END,
  'medium',
  settings."default_assignee_id",
  CASE
    WHEN COALESCE(u."scheduled_date", u."published_date") IS NULL THEN NULL
    ELSE COALESCE(u."scheduled_date", u."published_date")
      - COALESCE(settings."days_before_publication", stage.default_days)
  END,
  false,
  p."created_by"
FROM "projects" p
INNER JOIN "units" u ON u."project_id" = p."id"
CROSS JOIN (VALUES
  ('concept_outline', 'Create concept and outline', 42),
  ('write_script', 'Write script', 35),
  ('approve_script', 'Review and approve script', 28)
) AS stage(stage, label, default_days)
LEFT JOIN "podcast_stage_settings" settings
  ON settings."project_id" = p."id"
  AND settings."stage" = stage.stage::podcast_stage
WHERE p."kind" = 'video_series'
ON CONFLICT DO NOTHING;--> statement-breakpoint

INSERT INTO "task_dependencies" ("task_id", "depends_on_task_id")
SELECT current_task."id", previous_task."id"
FROM "projects" p
INNER JOIN "units" u ON u."project_id" = p."id"
CROSS JOIN (VALUES
  ('write_script', 'concept_outline'),
  ('approve_script', 'write_script'),
  ('produce_video', 'approve_script'),
  ('approve_video', 'produce_video'),
  ('schedule_episode', 'approve_video')
) AS edge(stage, depends_on)
INNER JOIN "tasks" current_task
  ON current_task."unit_id" = u."id"
  AND current_task."podcast_stage" = edge.stage::podcast_stage
INNER JOIN "tasks" previous_task
  ON previous_task."unit_id" = u."id"
  AND previous_task."podcast_stage" = edge.depends_on::podcast_stage
WHERE p."kind" = 'video_series'
ON CONFLICT DO NOTHING;--> statement-breakpoint

DROP TABLE "_migration_0096_video_obsolete_stage_tasks";
