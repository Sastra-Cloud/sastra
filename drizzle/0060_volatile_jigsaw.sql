-- Keep the most recently refreshed suggestion for each quote tier. Point
-- extraction jobs and quote attachments at that keeper before removing the
-- repeated rows created from forwarded/replied copies of the same quotation.
WITH ranked_quotes AS (
  SELECT
    "id",
    first_value("id") OVER (
      PARTITION BY "run_id", "kind", "quantity_cps"
      ORDER BY "updated_at" DESC, "created_at" DESC, "id" DESC
    ) AS "keeper_id",
    row_number() OVER (
      PARTITION BY "run_id", "kind", "quantity_cps"
      ORDER BY "updated_at" DESC, "created_at" DESC, "id" DESC
    ) AS "position"
  FROM "print_quotes"
  WHERE "review_status" = 'suggested' AND "quantity_cps" IS NOT NULL
)
UPDATE "print_extraction_jobs" AS jobs
SET "quote_id" = ranked."keeper_id", "updated_at" = now()
FROM ranked_quotes AS ranked
WHERE jobs."quote_id" = ranked."id" AND ranked."position" > 1;
--> statement-breakpoint
WITH ranked_quotes AS (
  SELECT
    "id",
    first_value("id") OVER (
      PARTITION BY "run_id", "kind", "quantity_cps"
      ORDER BY "updated_at" DESC, "created_at" DESC, "id" DESC
    ) AS "keeper_id",
    row_number() OVER (
      PARTITION BY "run_id", "kind", "quantity_cps"
      ORDER BY "updated_at" DESC, "created_at" DESC, "id" DESC
    ) AS "position"
  FROM "print_quotes"
  WHERE "review_status" = 'suggested' AND "quantity_cps" IS NOT NULL
)
UPDATE "file_attachments" AS attachments
SET "target_id" = ranked."keeper_id"
FROM ranked_quotes AS ranked
WHERE attachments."target_type" = 'print_quote'
  AND attachments."target_id" = ranked."id"
  AND ranked."position" > 1;
--> statement-breakpoint
DELETE FROM "file_attachments" AS duplicate
USING "file_attachments" AS keeper
WHERE duplicate."target_type" = 'print_quote'
  AND keeper."target_type" = 'print_quote'
  AND duplicate."target_id" = keeper."target_id"
  AND duplicate."file_id" = keeper."file_id"
  AND duplicate."id" > keeper."id";
--> statement-breakpoint
WITH ranked_quotes AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "run_id", "kind", "quantity_cps"
      ORDER BY "updated_at" DESC, "created_at" DESC, "id" DESC
    ) AS "position"
  FROM "print_quotes"
  WHERE "review_status" = 'suggested' AND "quantity_cps" IS NOT NULL
)
DELETE FROM "print_quotes" AS quotes
USING ranked_quotes AS ranked
WHERE quotes."id" = ranked."id" AND ranked."position" > 1;
--> statement-breakpoint
-- Accepted invoice files belong on the payment that finance will actually send.
INSERT INTO "file_attachments" (
  "file_id",
  "target_type",
  "target_id",
  "label",
  "created_at"
)
SELECT
  quote_files."file_id",
  'print_payment'::"attach_target",
  payments."id",
  'invoice',
  now()
FROM "print_payments" AS payments
INNER JOIN "print_quotes" AS quotes ON quotes."id" = payments."quote_id"
INNER JOIN "file_attachments" AS quote_files
  ON quote_files."target_type" = 'print_quote'
  AND quote_files."target_id" = quotes."id"
WHERE quotes."review_status" = 'accepted'
  AND (
    (quotes."kind" = 'deposit_invoice' AND payments."kind" = 'deposit')
    OR (quotes."kind" = 'final_invoice' AND payments."kind" IN ('final', 'full'))
    OR (quotes."kind" = 'invoice' AND payments."kind" IN ('deposit', 'final', 'full'))
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "file_attachments" AS payment_files
    WHERE payment_files."target_type" = 'print_payment'
      AND payment_files."target_id" = payments."id"
      AND payment_files."file_id" = quote_files."file_id"
  );
--> statement-breakpoint
CREATE UNIQUE INDEX "print_quotes_suggested_tier_uq" ON "print_quotes" USING btree ("run_id","kind","quantity_cps") WHERE "print_quotes"."review_status" = 'suggested' and "print_quotes"."quantity_cps" is not null;
