-- Standup conversations become private to the person answering them: from now
-- on a standup channel's only member is its participant (see lib/standup/engine.ts),
-- and member-scoped channels are closed to everyone else. Give every existing
-- standup channel its participant as a member, so people keep their own history.
-- Data impact: adds rows only. Rollback: delete chat_channel_members rows whose
-- channel has kind 'standup'.
INSERT INTO "chat_channel_members" ("channel_id", "user_id")
SELECT DISTINCT r."channel_id", r."user_id"
FROM "standup_runs" r
INNER JOIN "chat_channels" c ON c."id" = r."channel_id"
INNER JOIN "user" u ON u."id" = r."user_id"
WHERE r."channel_id" IS NOT NULL AND c."kind" = 'standup'
ON CONFLICT ("channel_id", "user_id") DO NOTHING;
