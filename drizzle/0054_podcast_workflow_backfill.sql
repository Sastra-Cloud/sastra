-- Materialize the fixed workflow for podcast episodes that predate 0053.
-- Historical tasks intentionally do not emit assignment notifications. New
-- episodes continue to use the application's shared task-creation path.
WITH stage_values(stage, label, default_days) AS (
  VALUES
    ('translate_script'::podcast_stage, 'Translate script', 42),
    ('approve_translation'::podcast_stage, 'Edit and approve translation', 35),
    ('record_audio'::podcast_stage, 'Record audio', 28),
    ('master_audio'::podcast_stage, 'Edit and master audio', 14),
    ('produce_video'::podcast_stage, 'Produce video', 21),
    ('approve_video'::podcast_stage, 'Review and approve video', 7),
    ('schedule_episode'::podcast_stage, 'Schedule episode', 2)
)
INSERT INTO tasks (
  project_id,
  unit_id,
  podcast_stage,
  title,
  status,
  priority,
  assigned_to,
  created_by,
  due_date,
  due_date_is_manual,
  order_index,
  rank,
  is_milestone,
  completed_at,
  created_at,
  updated_at
)
SELECT
  u.project_id,
  u.id,
  stage_values.stage,
  u.name || ': ' || stage_values.label,
  (CASE WHEN u.status = 'draft' THEN 'todo' ELSE 'done' END)::task_status,
  'medium'::priority,
  stage_settings.default_assignee_id,
  NULL,
  CASE
    WHEN COALESCE(u.scheduled_date, u.published_date) IS NULL THEN NULL
    ELSE COALESCE(u.scheduled_date, u.published_date)
      - COALESCE(stage_settings.days_before_publication, stage_values.default_days)
  END,
  false,
  0,
  0,
  false,
  CASE
    WHEN u.status = 'draft' THEN NULL
    ELSE COALESCE(
      u.published_date::timestamp,
      u.scheduled_date::timestamp,
      now()
    )
  END,
  now(),
  now()
FROM units u
INNER JOIN projects p ON p.id = u.project_id
CROSS JOIN stage_values
LEFT JOIN podcast_stage_settings stage_settings
  ON stage_settings.project_id = u.project_id
  AND stage_settings.stage = stage_values.stage
WHERE p.kind = 'podcast'
  AND (
    stage_values.stage NOT IN ('produce_video', 'approve_video')
    OR COALESCE(u.video_required_override, p.video_required)
  )
ON CONFLICT (unit_id, podcast_stage)
  WHERE podcast_stage IS NOT NULL
  DO NOTHING;
--> statement-breakpoint
WITH dependency_edges(stage, depends_on) AS (
  VALUES
    ('approve_translation'::podcast_stage, 'translate_script'::podcast_stage),
    ('record_audio'::podcast_stage, 'approve_translation'::podcast_stage),
    ('master_audio'::podcast_stage, 'record_audio'::podcast_stage),
    ('produce_video'::podcast_stage, 'approve_translation'::podcast_stage),
    ('approve_video'::podcast_stage, 'produce_video'::podcast_stage),
    ('schedule_episode'::podcast_stage, 'master_audio'::podcast_stage),
    ('schedule_episode'::podcast_stage, 'approve_video'::podcast_stage)
)
INSERT INTO task_dependencies (task_id, depends_on_task_id)
SELECT stage_task.id, predecessor_task.id
FROM units u
INNER JOIN projects p ON p.id = u.project_id
CROSS JOIN dependency_edges
INNER JOIN tasks stage_task
  ON stage_task.unit_id = u.id
  AND stage_task.podcast_stage = dependency_edges.stage
INNER JOIN tasks predecessor_task
  ON predecessor_task.unit_id = u.id
  AND predecessor_task.podcast_stage = dependency_edges.depends_on
WHERE p.kind = 'podcast'
  AND (
    dependency_edges.stage NOT IN ('produce_video', 'approve_video')
      AND dependency_edges.depends_on NOT IN ('produce_video', 'approve_video')
    OR COALESCE(u.video_required_override, p.video_required)
  )
ON CONFLICT (task_id, depends_on_task_id) DO NOTHING;
