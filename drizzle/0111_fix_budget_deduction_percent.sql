-- Custom SQL migration file, put your code below! --
-- The first partner-quote release stored whole percentages (13) directly in a
-- basis-point column, displaying them as 0.13%. Correct only those malformed
-- sub-1% rows; new writes convert 13% to 1300 basis points.
UPDATE "budget_scope_presentations"
SET "deduction_bps" = "deduction_bps" * 100
WHERE "deduction_bps" > 0
  AND "deduction_bps" < 100;
