CREATE TABLE "lectio_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"epoch" text NOT NULL,
	"origin" text NOT NULL,
	"team_id" text NOT NULL,
	"team_name" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"incoming_key_id" text DEFAULT 'initial' NOT NULL,
	"incoming_secret" text NOT NULL,
	"outgoing_key_id" text DEFAULT 'initial' NOT NULL,
	"outgoing_secret" text NOT NULL,
	"previous_incoming_key_id" text,
	"previous_incoming_secret" text,
	"previous_incoming_expires_at" timestamp with time zone,
	"auto_create" boolean DEFAULT false NOT NULL,
	"profile" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"paired_by" text,
	"last_success_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lectio_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" text NOT NULL,
	"operation_id" text NOT NULL,
	"direction" text NOT NULL,
	"kind" text NOT NULL,
	"fingerprint" text NOT NULL,
	"payload" jsonb NOT NULL,
	"result" jsonb,
	"state" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_until" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lectio_pairing_intents" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"origin" text NOT NULL,
	"verifier" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"connection_id" text,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "lectio_project_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" text NOT NULL,
	"project_id" uuid,
	"remote_project_id" text NOT NULL,
	"project_key" text NOT NULL,
	"generation" integer DEFAULT 1 NOT NULL,
	"state" text DEFAULT 'linking' NOT NULL,
	"stage_map" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_version" integer DEFAULT 0 NOT NULL,
	"requested_version" integer DEFAULT 0 NOT NULL,
	"planning_version" integer DEFAULT 0 NOT NULL,
	"snapshot" jsonb,
	"last_applied_at" timestamp with time zone,
	"last_fetched_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lectio_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" text NOT NULL,
	"request_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lectio_task_links" (
	"task_id" uuid PRIMARY KEY NOT NULL,
	"link_id" uuid NOT NULL,
	"document_id" text NOT NULL,
	"step_keys" jsonb NOT NULL,
	"observed_state" text DEFAULT 'todo' NOT NULL,
	"reopen_pending" boolean DEFAULT false NOT NULL,
	"retained_cycle" text,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lectio_unit_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"link_id" uuid NOT NULL,
	"document_id" text NOT NULL,
	"unit_id" uuid NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lectio_user_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" text NOT NULL,
	"user_id" text NOT NULL,
	"remote_user_id" text NOT NULL,
	"remote_name" text NOT NULL,
	"confirmed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "lectio_managed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "lectio_connections" ADD CONSTRAINT "lectio_connections_paired_by_user_id_fk" FOREIGN KEY ("paired_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lectio_operations" ADD CONSTRAINT "lectio_operations_connection_id_lectio_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."lectio_connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lectio_pairing_intents" ADD CONSTRAINT "lectio_pairing_intents_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lectio_project_links" ADD CONSTRAINT "lectio_project_links_connection_id_lectio_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."lectio_connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lectio_project_links" ADD CONSTRAINT "lectio_project_links_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lectio_requests" ADD CONSTRAINT "lectio_requests_connection_id_lectio_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."lectio_connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lectio_task_links" ADD CONSTRAINT "lectio_task_links_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lectio_task_links" ADD CONSTRAINT "lectio_task_links_link_id_lectio_project_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."lectio_project_links"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lectio_unit_links" ADD CONSTRAINT "lectio_unit_links_link_id_lectio_project_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."lectio_project_links"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lectio_unit_links" ADD CONSTRAINT "lectio_unit_links_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lectio_user_links" ADD CONSTRAINT "lectio_user_links_connection_id_lectio_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."lectio_connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lectio_user_links" ADD CONSTRAINT "lectio_user_links_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lectio_user_links" ADD CONSTRAINT "lectio_user_links_confirmed_by_user_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lectio_connection_origin_team" ON "lectio_connections" USING btree ("origin","team_id") WHERE "lectio_connections"."state" <> 'revoked';--> statement-breakpoint
CREATE UNIQUE INDEX "lectio_operation_key" ON "lectio_operations" USING btree ("connection_id","direction","operation_id");--> statement-breakpoint
CREATE INDEX "lectio_operations_due" ON "lectio_operations" USING btree ("state","available_at");--> statement-breakpoint
CREATE UNIQUE INDEX "lectio_project_local" ON "lectio_project_links" USING btree ("project_id") WHERE "lectio_project_links"."state" in ('active', 'linking');--> statement-breakpoint
CREATE UNIQUE INDEX "lectio_project_remote" ON "lectio_project_links" USING btree ("connection_id","remote_project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lectio_project_key" ON "lectio_project_links" USING btree ("connection_id","project_key");--> statement-breakpoint
CREATE UNIQUE INDEX "lectio_request_replay" ON "lectio_requests" USING btree ("connection_id","request_id");--> statement-breakpoint
CREATE INDEX "lectio_requests_cleanup" ON "lectio_requests" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "lectio_tasks_link" ON "lectio_task_links" USING btree ("link_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lectio_unit_document" ON "lectio_unit_links" USING btree ("link_id","document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lectio_unit_local" ON "lectio_unit_links" USING btree ("unit_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lectio_person_local" ON "lectio_user_links" USING btree ("connection_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lectio_person_remote" ON "lectio_user_links" USING btree ("connection_id","remote_user_id");