CREATE TABLE "hosted_entitlements" (
	"id" text PRIMARY KEY DEFAULT 'workspace' NOT NULL,
	"instance_id" text,
	"seat_limit" integer,
	"ai_monthly_credits" integer DEFAULT 0 NOT NULL,
	"ai_pack_credits" integer DEFAULT 0 NOT NULL,
	"billing_state" text DEFAULT 'active' NOT NULL,
	"effective_at" timestamp DEFAULT now() NOT NULL,
	"last_event_id" text,
	"last_event_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hosted_management_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"received_at" timestamp DEFAULT now() NOT NULL
);
