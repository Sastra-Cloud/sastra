CREATE TABLE "user_role_capacity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"project_role_id" uuid NOT NULL,
	"projects_at_once" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_role_capacity" ADD CONSTRAINT "user_role_capacity_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role_capacity" ADD CONSTRAINT "user_role_capacity_project_role_id_project_roles_id_fk" FOREIGN KEY ("project_role_id") REFERENCES "public"."project_roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_role_capacity_unique" ON "user_role_capacity" USING btree ("user_id","project_role_id");