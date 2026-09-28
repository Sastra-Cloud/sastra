-- Move AI task models that still hold a shipped default to Claude Sonnet 5.5.
-- Settings ▸ AI always records updated_by on save, so rows an admin chose are
-- left alone.
UPDATE ai_task_models
SET model = 'anthropic/claude-sonnet-5.5', updated_at = now()
WHERE updated_by IS NULL
  AND model IN ('anthropic/claude-sonnet-5', 'anthropic/claude-sonnet-4.5');
--> statement-breakpoint

-- Email drafting falls back one generation behind its primary model.
UPDATE ai_task_models
SET fallback_models = ARRAY['anthropic/claude-sonnet-5'], updated_at = now()
WHERE updated_by IS NULL
  AND task_key = 'email_draft'
  AND fallback_models = ARRAY['anthropic/claude-sonnet-4.6'];
--> statement-breakpoint

UPDATE ai_task_models
SET fallback_models = array_replace(fallback_models, 'anthropic/claude-sonnet-5', 'anthropic/claude-sonnet-5.5'),
    updated_at = now()
WHERE updated_by IS NULL
  AND task_key <> 'email_draft'
  AND 'anthropic/claude-sonnet-5' = ANY(fallback_models);
