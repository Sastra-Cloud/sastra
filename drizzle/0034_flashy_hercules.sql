CREATE TYPE "public"."email_direction" AS ENUM('inbound', 'outbound');--> statement-breakpoint
CREATE TYPE "public"."email_thread_status" AS ENUM('open', 'waiting', 'done');--> statement-breakpoint
CREATE TYPE "public"."gmail_connection_type" AS ENUM('dwd', 'oauth');--> statement-breakpoint
ALTER TYPE "public"."attach_target" ADD VALUE 'email_message';--> statement-breakpoint
CREATE TABLE "email_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"gmail_message_id" text NOT NULL,
	"direction" "email_direction" NOT NULL,
	"from_addr" text,
	"to_addrs" text[],
	"cc_addrs" text[],
	"subject" text,
	"snippet" text,
	"body_text" text,
	"body_html" text,
	"attributed_user_id" text,
	"history_id" text,
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "email_messages_gmail_message_id_unique" UNIQUE("gmail_message_id")
);
--> statement-breakpoint
CREATE TABLE "email_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gmail_thread_id" text NOT NULL,
	"mailbox" text NOT NULL,
	"subject" text,
	"status" "email_thread_status" DEFAULT 'open' NOT NULL,
	"last_message_at" timestamp,
	"last_direction" "email_direction",
	"owner_user_id" text,
	"assignee_id" text,
	"project_id" uuid,
	"holder_id" uuid,
	"contact_id" uuid,
	"linked_manually" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "email_threads_gmail_thread_id_unique" UNIQUE("gmail_thread_id")
);
--> statement-breakpoint
CREATE TABLE "gmail_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mailbox" text NOT NULL,
	"connection_type" "gmail_connection_type" DEFAULT 'dwd' NOT NULL,
	"user_id" text,
	"history_id" text,
	"watch_expires_at" timestamp,
	"last_synced_at" timestamp,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "gmail_accounts_mailbox_unique" UNIQUE("mailbox")
);
--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_thread_id_email_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."email_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_attributed_user_id_user_id_fk" FOREIGN KEY ("attributed_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_threads" ADD CONSTRAINT "email_threads_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_threads" ADD CONSTRAINT "email_threads_assignee_id_user_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_threads" ADD CONSTRAINT "email_threads_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_threads" ADD CONSTRAINT "email_threads_holder_id_rights_holders_id_fk" FOREIGN KEY ("holder_id") REFERENCES "public"."rights_holders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_threads" ADD CONSTRAINT "email_threads_contact_id_rights_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."rights_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gmail_accounts" ADD CONSTRAINT "gmail_accounts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_messages_thread_idx" ON "email_messages" USING btree ("thread_id","sent_at");--> statement-breakpoint
CREATE INDEX "email_messages_attributed_idx" ON "email_messages" USING btree ("attributed_user_id");--> statement-breakpoint
CREATE INDEX "email_threads_project_idx" ON "email_threads" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "email_threads_holder_idx" ON "email_threads" USING btree ("holder_id");--> statement-breakpoint
CREATE INDEX "email_threads_mailbox_idx" ON "email_threads" USING btree ("mailbox","last_message_at");--> statement-breakpoint
CREATE INDEX "email_threads_status_idx" ON "email_threads" USING btree ("status","last_message_at");--> statement-breakpoint
CREATE INDEX "gmail_accounts_user_idx" ON "gmail_accounts" USING btree ("user_id");