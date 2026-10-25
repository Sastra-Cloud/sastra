CREATE TABLE "lectio_sso_clients" (
	"connection_id" text PRIMARY KEY NOT NULL,
	"issuer" text NOT NULL,
	"client_id" text NOT NULL,
	"secret" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lectio_sso_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"issuer" text NOT NULL,
	"subject" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lectio_sso_sessions" (
	"session_id" text PRIMARY KEY NOT NULL,
	"identity_id" uuid NOT NULL,
	"connection_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lectio_sso_clients" ADD CONSTRAINT "lectio_sso_clients_connection_id_lectio_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."lectio_connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lectio_sso_identities" ADD CONSTRAINT "lectio_sso_identities_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lectio_sso_sessions" ADD CONSTRAINT "lectio_sso_sessions_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lectio_sso_sessions" ADD CONSTRAINT "lectio_sso_sessions_identity_id_lectio_sso_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."lectio_sso_identities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lectio_sso_sessions" ADD CONSTRAINT "lectio_sso_sessions_connection_id_lectio_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."lectio_connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lectio_sso_subject" ON "lectio_sso_identities" USING btree ("issuer","subject");--> statement-breakpoint
CREATE UNIQUE INDEX "lectio_sso_user_issuer" ON "lectio_sso_identities" USING btree ("user_id","issuer");