-- A deposit invoice is valid support for a calculated final balance until the
-- printer sends a dedicated final invoice. Once a reviewed final invoice is
-- available, make its PDFs the preferred files on final/full payment rows.
WITH preferred_final_quotes AS (
	SELECT id, run_id
	FROM (
		SELECT
			q.id,
			q.run_id,
			row_number() OVER (
				PARTITION BY q.run_id
				ORDER BY q.accepted_at DESC NULLS LAST, q.created_at DESC
			) AS rank
		FROM print_quotes q
		WHERE q.kind = 'final_invoice'
			AND q.review_status = 'accepted'
			AND EXISTS (
				SELECT 1
				FROM file_attachments source_file
				WHERE source_file.target_type = 'print_quote'
					AND source_file.target_id = q.id
			)
	) ranked
	WHERE rank = 1
), preferred_final_files AS (
	SELECT preferred.run_id, source_file.file_id
	FROM preferred_final_quotes preferred
	JOIN file_attachments source_file
		ON source_file.target_type = 'print_quote'
		AND source_file.target_id = preferred.id
)
INSERT INTO file_attachments (file_id, target_type, target_id, label)
SELECT DISTINCT
	preferred_file.file_id,
	'print_payment'::attach_target,
	payment.id,
	'invoice'
FROM preferred_final_files preferred_file
JOIN print_payments payment
	ON payment.run_id = preferred_file.run_id
	AND payment.kind IN ('final', 'full')
WHERE NOT EXISTS (
	SELECT 1
	FROM file_attachments existing
	WHERE existing.target_type = 'print_payment'
		AND existing.target_id = payment.id
		AND existing.file_id = preferred_file.file_id
);
--> statement-breakpoint
WITH preferred_final_quotes AS (
	SELECT id, run_id
	FROM (
		SELECT
			q.id,
			q.run_id,
			row_number() OVER (
				PARTITION BY q.run_id
				ORDER BY q.accepted_at DESC NULLS LAST, q.created_at DESC
			) AS rank
		FROM print_quotes q
		WHERE q.kind = 'final_invoice'
			AND q.review_status = 'accepted'
			AND EXISTS (
				SELECT 1
				FROM file_attachments source_file
				WHERE source_file.target_type = 'print_quote'
					AND source_file.target_id = q.id
			)
	) ranked
	WHERE rank = 1
), preferred_final_files AS (
	SELECT preferred.run_id, source_file.file_id
	FROM preferred_final_quotes preferred
	JOIN file_attachments source_file
		ON source_file.target_type = 'print_quote'
		AND source_file.target_id = preferred.id
), accepted_deposit_files AS (
	SELECT quote.run_id, source_file.file_id
	FROM print_quotes quote
	JOIN file_attachments source_file
		ON source_file.target_type = 'print_quote'
		AND source_file.target_id = quote.id
	WHERE quote.kind = 'deposit_invoice'
		AND quote.review_status = 'accepted'
)
DELETE FROM file_attachments payment_file
USING print_payments payment, accepted_deposit_files deposit_file
WHERE payment_file.target_type = 'print_payment'
	AND payment_file.target_id = payment.id
	AND payment_file.label = 'invoice'
	AND payment.kind IN ('final', 'full')
	AND payment.run_id = deposit_file.run_id
	AND payment_file.file_id = deposit_file.file_id
	AND EXISTS (
		SELECT 1
		FROM preferred_final_files preferred_file
		WHERE preferred_file.run_id = payment.run_id
	)
	AND NOT EXISTS (
		SELECT 1
		FROM preferred_final_files preferred_file
		WHERE preferred_file.run_id = payment.run_id
			AND preferred_file.file_id = payment_file.file_id
	);
