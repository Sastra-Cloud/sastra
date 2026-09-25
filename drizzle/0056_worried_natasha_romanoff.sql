CREATE TABLE "mou_payment_projects" (
	"payment_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	CONSTRAINT "mou_payment_projects_payment_id_project_id_pk" PRIMARY KEY("payment_id","project_id")
);
--> statement-breakpoint
ALTER TABLE "mou_payment_projects" ADD CONSTRAINT "mou_payment_projects_payment_id_mou_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."mou_payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mou_payment_projects" ADD CONSTRAINT "mou_payment_projects_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mou_payment_projects_project_idx" ON "mou_payment_projects" USING btree ("project_id");