ALTER TABLE "workspace_settings" ALTER COLUMN "capacity_groups" SET DEFAULT '[{"key":"books","name":"Books","concurrency":3,"kinds":["book"]},{"key":"media","name":"Creative media","concurrency":3,"kinds":["article","podcast","video_series","other"]}]'::jsonb;--> statement-breakpoint

-- Rename only the historical system labels. Other administrator-authored work
-- path names remain exactly as configured.
WITH renamed_groups AS (
  SELECT
    settings."id",
    jsonb_agg(
      CASE
        WHEN entry.value->>'key' = 'media'
          AND entry.value->>'name' IN ('Articles & podcasts', 'Articles, podcasts & video')
        THEN jsonb_set(entry.value, '{name}', '"Creative media"'::jsonb)
        ELSE entry.value
      END
      ORDER BY entry.ordinality
    ) AS "capacity_groups"
  FROM "workspace_settings" settings
  CROSS JOIN LATERAL jsonb_array_elements(settings."capacity_groups")
    WITH ORDINALITY AS entry(value, ordinality)
  GROUP BY settings."id"
)
UPDATE "workspace_settings" settings
SET "capacity_groups" = renamed_groups."capacity_groups"
FROM renamed_groups
WHERE settings."id" = renamed_groups."id"
  AND settings."capacity_groups" IS DISTINCT FROM renamed_groups."capacity_groups";
