ALTER TABLE "rights_items" DROP COLUMN "title";--> statement-breakpoint
ALTER TABLE "rights_items" DROP COLUMN "rights_type";--> statement-breakpoint
ALTER TABLE "rights_items" DROP COLUMN "status";--> statement-breakpoint
ALTER TABLE "rights_items" DROP COLUMN "counterparty";--> statement-breakpoint
ALTER TABLE "rights_items" DROP COLUMN "requested_at";--> statement-breakpoint
ALTER TABLE "rights_items" DROP COLUMN "resolved_at";--> statement-breakpoint
DROP TYPE "public"."rights_kind";--> statement-breakpoint
DROP TYPE "public"."rights_status";