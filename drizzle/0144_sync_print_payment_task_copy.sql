-- Existing generated payment tasks can still tell their owner to send a wire
-- after the wire has already been requested. Update only exact app-written copy;
-- a task description edited by a person stays untouched.
UPDATE tasks AS t
SET description = replace(
  t.description,
  'Ensure the wire request is sent and the printer payment is confirmed. This task follows the payment through requested and paid status.',
  CASE p.status
    WHEN 'requested' THEN 'The wire request has been sent. Confirm that the printer was paid, then mark the payment paid on the Print tab. This task will close automatically.'
    ELSE 'The printer payment was marked paid on the Print tab. This task closed automatically.'
  END
), updated_at = now()
FROM print_payments AS p
JOIN print_runs AS r ON r.id = p.run_id
LEFT JOIN print_quotes AS q ON q.id = p.quote_id
WHERE t.print_payment_id = p.id
  AND p.status IN ('requested', 'paid')
  AND t.description = concat(
    CASE WHEN q.invoice_number IS NOT NULL
      THEN concat('Invoice ', q.invoice_number, ' is ready')
      ELSE 'A confirmed printer invoice is ready'
    END,
    ' on the Print tab for ', r.title,
    '. Ensure the wire request is sent and the printer payment is confirmed. This task follows the payment through requested and paid status.'
  );
