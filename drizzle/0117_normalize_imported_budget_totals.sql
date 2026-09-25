-- Older document imports could preserve a stated line total alongside an
-- unrelated quantity and the same total repeated as the unit price. Budget
-- summaries used the stored total while row previews multiplied the other two
-- fields, producing contradictory amounts (for example 27 × $1,650 beside a
-- subtotal that correctly included only $1,650).
--
-- Normalize only that narrow, unambiguous signature. Keep the stored financial
-- total authoritative and avoid rows with partner-rate overrides, whose public
-- pricing may intentionally use different arithmetic.
UPDATE "budget_items"
SET
  "unit" = 'flat',
  "quantity" = 1,
  "unit_price" = "amount",
  "updated_at" = now()
WHERE "is_auto_quantity" = false
  AND "partner_unit_price" IS NULL
  AND "quantity" <> 1
  AND "unit_price" = "amount";
