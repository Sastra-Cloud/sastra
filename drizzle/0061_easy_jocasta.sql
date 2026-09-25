DROP INDEX "print_quotes_suggested_tier_uq";--> statement-breakpoint
-- The text and PDF parsers can label the same commercial tier as either a
-- quote or a generic invoice. Consolidate those labels while preserving the
-- distinct deposit_invoice and final_invoice stages.
WITH ranked_quotes AS (
  SELECT
    "id",
    first_value("id") OVER (
      PARTITION BY
        "run_id",
        CASE WHEN "kind" IN ('quote', 'invoice') THEN 'quote_or_invoice' ELSE "kind" END,
        "quantity_cps"
      ORDER BY "updated_at" DESC, "created_at" DESC, "id" DESC
    ) AS "keeper_id",
    row_number() OVER (
      PARTITION BY
        "run_id",
        CASE WHEN "kind" IN ('quote', 'invoice') THEN 'quote_or_invoice' ELSE "kind" END,
        "quantity_cps"
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
      PARTITION BY
        "run_id",
        CASE WHEN "kind" IN ('quote', 'invoice') THEN 'quote_or_invoice' ELSE "kind" END,
        "quantity_cps"
      ORDER BY "updated_at" DESC, "created_at" DESC, "id" DESC
    ) AS "keeper_id",
    row_number() OVER (
      PARTITION BY
        "run_id",
        CASE WHEN "kind" IN ('quote', 'invoice') THEN 'quote_or_invoice' ELSE "kind" END,
        "quantity_cps"
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
      PARTITION BY
        "run_id",
        CASE WHEN "kind" IN ('quote', 'invoice') THEN 'quote_or_invoice' ELSE "kind" END,
        "quantity_cps"
      ORDER BY "updated_at" DESC, "created_at" DESC, "id" DESC
    ) AS "position"
  FROM "print_quotes"
  WHERE "review_status" = 'suggested' AND "quantity_cps" IS NOT NULL
)
DELETE FROM "print_quotes" AS quotes
USING ranked_quotes AS ranked
WHERE quotes."id" = ranked."id" AND ranked."position" > 1;
--> statement-breakpoint
CREATE UNIQUE INDEX "print_quotes_suggested_tier_uq" ON "print_quotes" USING btree ("run_id",(case when "kind" in ('quote', 'invoice') then 'quote_or_invoice' else "kind" end),"quantity_cps") WHERE "print_quotes"."review_status" = 'suggested' and "print_quotes"."quantity_cps" is not null;
