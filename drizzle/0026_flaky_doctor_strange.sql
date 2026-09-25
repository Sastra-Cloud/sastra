CREATE TABLE "project_chat_pins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_chat_pins" ADD CONSTRAINT "project_chat_pins_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_chat_pins" ADD CONSTRAINT "project_chat_pins_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_chat_pins_unique" ON "project_chat_pins" USING btree ("project_id","user_id");--> statement-breakpoint
CREATE INDEX "project_chat_pins_user_idx" ON "project_chat_pins" USING btree ("user_id","created_at");