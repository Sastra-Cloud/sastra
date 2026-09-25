-- A custom #general can predate the baseline "general" channel. Older
-- bootstrapping checked only the channel kind and could therefore add a second,
-- empty #general. Remove only that empty baseline duplicate, preserving the
-- same-name standalone channel that already contains conversation history.
delete from chat_channels as duplicate
where duplicate.project_id is null
  and duplicate.kind = 'general'
  and lower(trim(duplicate.name)) = 'general'
  and not exists (
    select 1
    from chat_messages
    where chat_messages.channel_id = duplicate.id
  )
  and exists (
    select 1
    from chat_channels as canonical
    where canonical.id <> duplicate.id
      and canonical.project_id is null
      and canonical.kind not in ('direct', 'standup')
      and lower(trim(canonical.name)) = 'general'
      and exists (
        select 1
        from chat_messages
        where chat_messages.channel_id = canonical.id
      )
  );
