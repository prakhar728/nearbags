CREATE TABLE "gifts" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"sender_user_id" integer NOT NULL,
	"position_id" integer NOT NULL,
	"basket_id" integer NOT NULL,
	"message" text,
	"expires_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'funding' NOT NULL,
	"claimed_by_user_id" integer,
	"claim_tx" text,
	"claimed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "positions_user_basket_uq";--> statement-breakpoint
ALTER TABLE "positions" ADD COLUMN "kind" text DEFAULT 'own' NOT NULL;--> statement-breakpoint
ALTER TABLE "gifts" ADD CONSTRAINT "gifts_sender_user_id_users_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gifts" ADD CONSTRAINT "gifts_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gifts" ADD CONSTRAINT "gifts_basket_id_baskets_id_fk" FOREIGN KEY ("basket_id") REFERENCES "public"."baskets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gifts" ADD CONSTRAINT "gifts_claimed_by_user_id_users_id_fk" FOREIGN KEY ("claimed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "gifts_code_uq" ON "gifts" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "gifts_position_uq" ON "gifts" USING btree ("position_id");--> statement-breakpoint
CREATE INDEX "gifts_sender_idx" ON "gifts" USING btree ("sender_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "positions_user_basket_uq" ON "positions" USING btree ("user_id","basket_id") WHERE "positions"."kind" = 'own';