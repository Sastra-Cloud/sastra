ALTER TABLE "budget_items" ALTER COLUMN "unit_price" SET DATA TYPE numeric(16, 4);--> statement-breakpoint
ALTER TABLE "budget_items" ALTER COLUMN "unit_price" SET DEFAULT '0';