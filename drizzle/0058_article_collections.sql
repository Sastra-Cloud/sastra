-- Treat the existing article templates as collection workflows. Rights and
-- collection marketing stay project-wide; production/publishing fans out once
-- per article unit.
UPDATE "plan_templates"
SET
  "name" = CASE
    WHEN "key" = 'article-translation' THEN 'Article Collection'
    ELSE 'Article Collection + Audio/Video'
  END,
  "description" = CASE
    WHEN "key" = 'article-translation'
      THEN 'A collection of articles with per-article translation, editing, proofreading, and publication.'
    ELSE 'Per-article translation plus audio and/or video production for each item in the collection.'
  END,
  "updated_at" = now()
WHERE "key" IN ('article-translation', 'article-av');

-- Add the proofreading stage that the older article+AV template omitted.
UPDATE "phase_templates" AS "phase"
SET "order_index" = "phase"."order_index" + 1
FROM "plan_templates" AS "plan"
WHERE "phase"."plan_template_id" = "plan"."id"
  AND "plan"."key" = 'article-av'
  AND "phase"."name" IN ('Audio / Video Production', 'Marketing', 'Launch');

INSERT INTO "phase_templates" (
  "plan_template_id",
  "name",
  "order_index",
  "default_duration_days",
  "color"
)
SELECT
  "plan"."id",
  'Proofreading',
  "editing"."order_index" + 1,
  2,
  '#0891b2'
FROM "plan_templates" AS "plan"
JOIN "phase_templates" AS "editing"
  ON "editing"."plan_template_id" = "plan"."id"
  AND "editing"."name" = 'Editing'
WHERE "plan"."key" = 'article-av'
  AND NOT EXISTS (
    SELECT 1
    FROM "phase_templates" AS "existing"
    WHERE "existing"."plan_template_id" = "plan"."id"
      AND "existing"."name" = 'Proofreading'
  );

INSERT INTO "task_templates" (
  "phase_template_id",
  "name",
  "order_index",
  "default_project_role_id",
  "default_offset_days",
  "is_per_unit"
)
SELECT
  "phase"."id",
  'Proofread article',
  0,
  "role"."id",
  0,
  true
FROM "phase_templates" AS "phase"
JOIN "plan_templates" AS "plan"
  ON "plan"."id" = "phase"."plan_template_id"
LEFT JOIN "project_roles" AS "role"
  ON "role"."key" = 'proofread'
WHERE "plan"."key" = 'article-av'
  AND "phase"."name" = 'Proofreading'
  AND NOT EXISTS (
    SELECT 1
    FROM "task_templates" AS "existing"
    WHERE "existing"."phase_template_id" = "phase"."id"
  );

UPDATE "phase_templates" AS "phase"
SET "name" = 'Publication'
FROM "plan_templates" AS "plan"
WHERE "phase"."plan_template_id" = "plan"."id"
  AND "plan"."key" IN ('article-translation', 'article-av')
  AND "phase"."name" = 'Launch';

UPDATE "task_templates" AS "task"
SET "is_per_unit" = true
FROM "phase_templates" AS "phase"
JOIN "plan_templates" AS "plan"
  ON "plan"."id" = "phase"."plan_template_id"
WHERE "task"."phase_template_id" = "phase"."id"
  AND "plan"."key" IN ('article-translation', 'article-av')
  AND "phase"."name" IN (
    'Translation',
    'Editing',
    'Proofreading',
    'Audio / Video Production',
    'Publication'
  );

UPDATE "task_templates" AS "task"
SET "name" = 'Publish article'
FROM "phase_templates" AS "phase"
JOIN "plan_templates" AS "plan"
  ON "plan"."id" = "phase"."plan_template_id"
WHERE "task"."phase_template_id" = "phase"."id"
  AND "plan"."key" IN ('article-translation', 'article-av')
  AND "phase"."name" = 'Publication'
  AND "task"."name" = 'Publish & distribute';
