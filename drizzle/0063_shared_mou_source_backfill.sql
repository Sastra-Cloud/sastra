-- The enum value is committed by 0062 before this statement uses it. Preserve
-- one authoritative source attachment for each backfilled group.
INSERT INTO file_attachments (file_id, target_type, target_id, label)
SELECT DISTINCT ON (g.id)
	fa.file_id, 'agreement_group'::attach_target, g.id, 'source_agreement'
FROM shared_mou_groups g
JOIN shared_mou_memberships m ON m.group_id = g.id AND m.active
JOIN file_attachments fa
	ON fa.target_type = 'project'
	AND fa.target_id = m.project_id
	AND fa.label = 'agreement'
WHERE NOT EXISTS (
	SELECT 1
	FROM file_attachments existing
	WHERE existing.target_type = 'agreement_group'
		AND existing.target_id = g.id
)
ORDER BY g.id, fa.created_at;
