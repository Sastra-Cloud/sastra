CREATE TABLE "cron_runs" (
	"name" text PRIMARY KEY NOT NULL,
	"last_run_at" timestamp DEFAULT now() NOT NULL,
	"ok" boolean DEFAULT true NOT NULL,
	"note" text
);
