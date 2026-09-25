-- Replace the original parallel audio/video dependency graph with the actual
-- sequential production chain. Only dependencies between standard podcast
-- stage tasks are replaced; external/manual task dependencies are preserved.
DELETE FROM task_dependencies dependency
USING tasks stage_task, tasks predecessor_task, units episode, projects project
WHERE dependency.task_id = stage_task.id
  AND dependency.depends_on_task_id = predecessor_task.id
  AND stage_task.unit_id = episode.id
  AND predecessor_task.unit_id = episode.id
  AND episode.project_id = project.id
  AND project.kind = 'podcast'
  AND stage_task.podcast_stage IS NOT NULL
  AND predecessor_task.podcast_stage IS NOT NULL;
--> statement-breakpoint
WITH dependency_edges(stage, depends_on, video_mode) AS (
  VALUES
    ('approve_translation'::podcast_stage, 'translate_script'::podcast_stage, 'any'),
    ('record_audio'::podcast_stage, 'approve_translation'::podcast_stage, 'any'),
    ('master_audio'::podcast_stage, 'record_audio'::podcast_stage, 'any'),
    ('produce_video'::podcast_stage, 'master_audio'::podcast_stage, 'required'),
    ('approve_video'::podcast_stage, 'produce_video'::podcast_stage, 'required'),
    ('schedule_episode'::podcast_stage, 'approve_video'::podcast_stage, 'required'),
    ('schedule_episode'::podcast_stage, 'master_audio'::podcast_stage, 'skipped')
)
INSERT INTO task_dependencies (task_id, depends_on_task_id)
SELECT stage_task.id, predecessor_task.id
FROM units episode
INNER JOIN projects project ON project.id = episode.project_id
CROSS JOIN dependency_edges
INNER JOIN tasks stage_task
  ON stage_task.unit_id = episode.id
  AND stage_task.podcast_stage = dependency_edges.stage
INNER JOIN tasks predecessor_task
  ON predecessor_task.unit_id = episode.id
  AND predecessor_task.podcast_stage = dependency_edges.depends_on
WHERE project.kind = 'podcast'
  AND (
    dependency_edges.video_mode = 'any'
    OR (
      dependency_edges.video_mode = 'required'
      AND COALESCE(episode.video_required_override, project.video_required)
    )
    OR (
      dependency_edges.video_mode = 'skipped'
      AND NOT COALESCE(episode.video_required_override, project.video_required)
    )
  )
ON CONFLICT (task_id, depends_on_task_id) DO NOTHING;
--> statement-breakpoint
-- Projects that saved the original defaults should inherit the corrected
-- audio-first defaults. Other customized offsets remain untouched.
UPDATE podcast_stage_settings
SET days_before_publication = CASE
      WHEN stage = 'master_audio'::podcast_stage THEN 21
      WHEN stage = 'produce_video'::podcast_stage THEN 14
      ELSE days_before_publication
    END,
    updated_at = now()
WHERE (stage = 'master_audio'::podcast_stage AND days_before_publication = 14)
   OR (stage = 'produce_video'::podcast_stage AND days_before_publication = 21);
--> statement-breakpoint
-- Recalculate only unfinished, automatically managed deadlines. This corrects
-- the audio-master/video-production order without moving completed or manually
-- overridden task dates.
WITH stage_values(stage, default_days) AS (
  VALUES
    ('translate_script'::podcast_stage, 42),
    ('approve_translation'::podcast_stage, 35),
    ('record_audio'::podcast_stage, 28),
    ('master_audio'::podcast_stage, 21),
    ('produce_video'::podcast_stage, 14),
    ('approve_video'::podcast_stage, 7),
    ('schedule_episode'::podcast_stage, 2)
), recalculated AS (
  SELECT
    task.id,
    COALESCE(episode.scheduled_date, episode.published_date)
      - COALESCE(stage_settings.days_before_publication, stage_values.default_days)
      AS due_date
  FROM tasks task
  INNER JOIN units episode ON episode.id = task.unit_id
  INNER JOIN projects project ON project.id = episode.project_id
  INNER JOIN stage_values ON stage_values.stage = task.podcast_stage
  LEFT JOIN podcast_stage_settings stage_settings
    ON stage_settings.project_id = episode.project_id
    AND stage_settings.stage = task.podcast_stage
  WHERE project.kind = 'podcast'
    AND task.status <> 'done'
    AND NOT task.due_date_is_manual
    AND COALESCE(episode.scheduled_date, episode.published_date) IS NOT NULL
)
UPDATE tasks task
SET due_date = recalculated.due_date,
    updated_at = now()
FROM recalculated
WHERE task.id = recalculated.id;
