CREATE TABLE "print_email_lessons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operation" text NOT NULL,
	"lessons" text DEFAULT '' NOT NULL,
	"sample_count" integer DEFAULT 0 NOT NULL,
	"last_actor_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "print_email_lessons" ADD CONSTRAINT "print_email_lessons_last_actor_id_user_id_fk" FOREIGN KEY ("last_actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "print_email_lessons_operation_uq" ON "print_email_lessons" USING btree ("operation");