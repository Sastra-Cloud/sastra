-- Move only app-generated printer payment titles to the current next action.
-- The generated description check protects task titles edited by a person.
UPDATE tasks AS t
SET title = CASE p.status
    WHEN 'requested' THEN regexp_replace(t.title, '^Coordinate ([^—]+) payment — ', 'Confirm printer received \1 payment — ')
    WHEN 'paid' THEN regexp_replace(t.title, '^Coordinate [^—]+ payment — ', concat(initcap(CASE WHEN p.kind IN ('deposit', 'final', 'full') THEN p.kind ELSE 'printer' END), ' payment confirmed — '))
    ELSE regexp_replace(t.title, '^Coordinate ([^—]+) payment — ', 'Send \1 payment request — ')
  END,
  updated_at = now()
FROM print_payments AS p
JOIN print_runs AS r ON r.id = p.run_id
LEFT JOIN print_quotes AS q ON q.id = p.quote_id
WHERE t.print_payment_id = p.id
  AND t.title ~ concat('^Coordinate ', CASE WHEN p.kind IN ('deposit', 'final', 'full') THEN p.kind ELSE 'printer' END, ' payment — ')
  AND t.description IN (
    concat(CASE WHEN q.invoice_number IS NOT NULL THEN concat('Invoice ', q.invoice_number, ' is ready') ELSE 'A confirmed printer invoice is ready' END,
      ' on the Print tab for ', r.title,
      '. Ensure the wire request is sent and the printer payment is confirmed. This task follows the payment through requested and paid status.'),
    concat(CASE WHEN q.invoice_number IS NOT NULL THEN concat('Invoice ', q.invoice_number, ' is ready') ELSE 'A confirmed printer invoice is ready' END,
      ' on the Print tab for ', r.title,
      '. The wire request has been sent. Confirm that the printer was paid, then mark the payment paid on the Print tab. This task will close automatically.'),
    concat(CASE WHEN q.invoice_number IS NOT NULL THEN concat('Invoice ', q.invoice_number, ' is ready') ELSE 'A confirmed printer invoice is ready' END,
      ' on the Print tab for ', r.title,
      '. The printer payment was marked paid on the Print tab. This task closed automatically.')
  );
--> statement-breakpoint

-- Reconcile tasks attached to settled or reopened payment records. The ledger
-- remains the source of truth even when an older task has a stale status.
UPDATE tasks AS t
SET status = (CASE WHEN p.status = 'paid' THEN 'done' WHEN p.status = 'requested' THEN 'review' ELSE 'todo' END)::task_status,
    completed_at = CASE WHEN p.status = 'paid' THEN COALESCE(t.completed_at, p.paid_at, now()) ELSE NULL END,
    updated_at = now()
FROM print_payments AS p
WHERE t.print_payment_id = p.id
  AND (t.status IS DISTINCT FROM (CASE WHEN p.status = 'paid' THEN 'done' WHEN p.status = 'requested' THEN 'review' ELSE 'todo' END)::task_status
       OR (p.status <> 'paid' AND t.completed_at IS NOT NULL));
--> statement-breakpoint

UPDATE tasks AS t
SET status = (CASE WHEN p.paid_at IS NULL THEN 'todo' ELSE 'done' END)::task_status,
    completed_at = CASE WHEN p.paid_at IS NULL THEN NULL ELSE COALESCE(t.completed_at, p.paid_at) END,
    updated_at = now()
FROM royalty_payments AS p
WHERE p.task_id = t.id
  AND (t.status IS DISTINCT FROM (CASE WHEN p.paid_at IS NULL THEN 'todo' ELSE 'done' END)::task_status
       OR (p.paid_at IS NULL AND t.completed_at IS NOT NULL));
--> statement-breakpoint

UPDATE tasks AS t
SET status = (CASE WHEN p.paid_at IS NULL THEN 'todo' ELSE 'done' END)::task_status,
    completed_at = CASE WHEN p.paid_at IS NULL THEN NULL ELSE COALESCE(t.completed_at, p.paid_at) END,
    updated_at = now()
FROM license_fee_payments AS p
WHERE p.task_id = t.id
  AND (t.status IS DISTINCT FROM (CASE WHEN p.paid_at IS NULL THEN 'todo' ELSE 'done' END)::task_status
       OR (p.paid_at IS NULL AND t.completed_at IS NOT NULL));
--> statement-breakpoint

-- A delivered invoice is the completion event for its linked invoice task.
UPDATE tasks AS t
SET status = 'done', completed_at = COALESCE(t.completed_at, now()), updated_at = now()
FROM mou_payments AS p
WHERE p.invoice_task_id = t.id
  AND t.status <> 'done'
  AND EXISTS (
    SELECT 1 FROM invoices AS i
    WHERE i.mou_payment_id = p.id AND i.status = 'sent'
  );
