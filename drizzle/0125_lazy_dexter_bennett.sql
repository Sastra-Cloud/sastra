CREATE TABLE "user_guidance_dismissals" (
	"user_id" text NOT NULL,
	"guidance_key" text NOT NULL,
	"dismissed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_guidance_dismissals_user_id_guidance_key_pk" PRIMARY KEY("user_id","guidance_key")
);
--> statement-breakpoint
ALTER TABLE "user_guidance_dismissals" ADD CONSTRAINT "user_guidance_dismissals_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;