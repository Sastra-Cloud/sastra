-- The conversation-bearing workspace #general originated as a custom channel.
-- Normalize it to the workspace-wide kind once the empty duplicate cleanup has
-- run, so general remains available to every active teammate.
update chat_channels as channel
set kind = 'general'
where channel.project_id is null
  and channel.kind = 'custom'
  and lower(trim(channel.name)) = 'general'
  and not exists (
    select 1
    from chat_channels as existing_general
    where existing_general.id <> channel.id
      and existing_general.project_id is null
      and existing_general.kind = 'general'
  );
--> statement-breakpoint
-- Existing custom channels were historically workspace-wide. Give every active
-- human teammate an explicit membership before custom channels become private,
-- preserving current access while allowing managers to refine it afterward.
insert into chat_channel_members (channel_id, user_id)
select channel.id, teammate.id
from chat_channels as channel
cross join "user" as teammate
where channel.project_id is null
  and channel.kind = 'custom'
  and teammate.is_active = true
  and teammate.is_bot = false
on conflict (channel_id, user_id) do nothing;
