DROP INDEX "user_role_capacity_unique";--> statement-breakpoint
ALTER TABLE "user_role_capacity" ADD COLUMN "capacity_group_key" text DEFAULT 'books' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "user_role_capacity_unique" ON "user_role_capacity" USING btree ("user_id","project_role_id","capacity_group_key");