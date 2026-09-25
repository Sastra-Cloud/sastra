CREATE TABLE "task_drive_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"drive_file_id" text NOT NULL,
	"name" text NOT NULL,
	"mime_type" text,
	"icon_url" text,
	"url" text NOT NULL,
	"added_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "task_drive_files" ADD CONSTRAINT "task_drive_files_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_drive_files" ADD CONSTRAINT "task_drive_files_added_by_user_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "task_drive_files_unique" ON "task_drive_files" USING btree ("task_id","drive_file_id");