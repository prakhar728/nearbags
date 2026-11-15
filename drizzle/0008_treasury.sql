CREATE TABLE "treasuries" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"position_id" integer NOT NULL,
	"route_fees" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "treasuries" ADD CONSTRAINT "treasuries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treasuries" ADD CONSTRAINT "treasuries_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "treasuries_user_uq" ON "treasuries" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "treasuries_position_uq" ON "treasuries" USING btree ("position_id");