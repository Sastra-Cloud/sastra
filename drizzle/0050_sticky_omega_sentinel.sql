ALTER TYPE "public"."obligation_cadence" ADD VALUE 'monthly' BEFORE 'quarterly';--> statement-breakpoint
ALTER TYPE "public"."obligation_cadence" ADD VALUE 'annual' BEFORE 'standing';