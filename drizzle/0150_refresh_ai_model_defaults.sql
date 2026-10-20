-- Refresh shipped model defaults without overriding choices saved by an admin.
UPDATE ai_task_models
SET model = CASE model
      WHEN 'anthropic/claude-haiku-4.5' THEN 'anthropic/claude-haiku-5.5'
      WHEN 'openai/gpt-5-mini' THEN 'openai/gpt-5.4-mini'
      WHEN 'openai/gpt-5.4' THEN 'openai/gpt-5.6-sol'
      WHEN 'openai/gpt-5.5' THEN 'openai/gpt-5.6-sol'
      WHEN 'google/gemini-2.5-flash-lite' THEN 'google/gemini-3.5-flash-lite'
      WHEN 'google/gemini-2.5-flash' THEN 'google/gemini-3.8-flash'
      WHEN 'google/gemini-3.1-pro' THEN 'google/gemini-3.1-pro-preview'
      WHEN 'deepseek/deepseek-chat' THEN 'deepseek/deepseek-v4.1-flash'
    END,
    updated_at = now()
WHERE updated_by IS NULL
  AND model IN (
    'anthropic/claude-haiku-4.5', 'openai/gpt-5-mini', 'openai/gpt-5.4',
    'openai/gpt-5.5', 'google/gemini-2.5-flash-lite', 'google/gemini-2.5-flash',
    'google/gemini-3.1-pro', 'deepseek/deepseek-chat'
  );
--> statement-breakpoint

-- Preserve fallback order, other models, and the pinned Sonnet 5 email fallback.
UPDATE ai_task_models
SET fallback_models = array_replace(
      array_replace(
        array_replace(
          array_replace(
            array_replace(
              array_replace(
                array_replace(
                  array_replace(fallback_models,
                    'anthropic/claude-haiku-4.5', 'anthropic/claude-haiku-5.5'),
                  'openai/gpt-5-mini', 'openai/gpt-5.4-mini'),
                'openai/gpt-5.4', 'openai/gpt-5.6-sol'),
              'openai/gpt-5.5', 'openai/gpt-5.6-sol'),
            'google/gemini-2.5-flash-lite', 'google/gemini-3.5-flash-lite'),
          'google/gemini-2.5-flash', 'google/gemini-3.8-flash'),
        'google/gemini-3.1-pro', 'google/gemini-3.1-pro-preview'),
      'deepseek/deepseek-chat', 'deepseek/deepseek-v4.1-flash'),
    updated_at = now()
WHERE updated_by IS NULL
  AND fallback_models && ARRAY[
    'anthropic/claude-haiku-4.5', 'openai/gpt-5-mini', 'openai/gpt-5.4',
    'openai/gpt-5.5', 'google/gemini-2.5-flash-lite', 'google/gemini-2.5-flash',
    'google/gemini-3.1-pro', 'deepseek/deepseek-chat'
  ];
