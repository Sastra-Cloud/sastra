ALTER TABLE "tasks" ADD COLUMN "print_payment_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_print_payment_id_print_payments_id_fk" FOREIGN KEY ("print_payment_id") REFERENCES "public"."print_payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_print_payment_unique" ON "tasks" USING btree ("print_payment_id");