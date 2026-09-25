ALTER TABLE "email_preferences" ADD COLUMN "push_review_suggestions" boolean DEFAULT false NOT NULL;--> statement-breakpoint

-- Reconcile legacy rights tasks that predate rights_items.mou_task_id /
-- license_task_id. Only a single open task that names both the rights work and
-- the approved holder qualifies; ambiguous matches remain untouched.
CREATE TEMP TABLE "_satisfied_rights_task_backfill" ON COMMIT DROP AS
WITH candidates AS (
	SELECT
		r.id AS rights_id,
		'mou'::text AS step,
		t.id AS task_id,
		count(*) OVER (PARTITION BY r.id, 'mou'::text) AS candidate_count
	FROM rights_items r
	JOIN rights_holders h ON h.id = r.mou_holder_id
	JOIN tasks t ON t.project_id = r.project_id AND t.status <> 'done'
	LEFT JOIN phases ph ON ph.id = t.phase_id
	WHERE r.mou_status = 'signed'
		AND r.mou_task_id IS NULL
		AND lower(regexp_replace(t.title, '[^a-zA-Z0-9]+', ' ', 'g')) LIKE
			'%' || lower(regexp_replace(h.name, '[^a-zA-Z0-9]+', ' ', 'g')) || '%'
		AND (
			t.title ~* '\m(rights?|mou|memorandum|permissions?)\M'
			OR ph.name ~* '\mrights?\M'
		)
	UNION ALL
	SELECT
		r.id AS rights_id,
		'license'::text AS step,
		t.id AS task_id,
		count(*) OVER (PARTITION BY r.id, 'license'::text) AS candidate_count
	FROM rights_items r
	JOIN rights_holders h ON h.id = r.license_holder_id
	JOIN tasks t ON t.project_id = r.project_id AND t.status <> 'done'
	LEFT JOIN phases ph ON ph.id = t.phase_id
	WHERE r.license_status = 'signed'
		AND r.license_task_id IS NULL
		AND lower(regexp_replace(t.title, '[^a-zA-Z0-9]+', ' ', 'g')) LIKE
			'%' || lower(regexp_replace(h.name, '[^a-zA-Z0-9]+', ' ', 'g')) || '%'
		AND (
			t.title ~* '\m(rights?|licen[cs]e|permissions?)\M'
			OR ph.name ~* '\mrights?\M'
		)
)
SELECT rights_id, step, task_id
FROM candidates
WHERE candidate_count = 1;--> statement-breakpoint

UPDATE rights_items r
SET mou_task_id = matched.task_id, updated_at = now()
FROM "_satisfied_rights_task_backfill" matched
WHERE matched.rights_id = r.id AND matched.step = 'mou';--> statement-breakpoint

UPDATE rights_items r
SET license_task_id = matched.task_id, updated_at = now()
FROM "_satisfied_rights_task_backfill" matched
WHERE matched.rights_id = r.id AND matched.step = 'license';--> statement-breakpoint

UPDATE tasks t
SET status = 'done', completed_at = now(), updated_at = now()
FROM "_satisfied_rights_task_backfill" matched
WHERE matched.task_id = t.id AND t.status <> 'done';
