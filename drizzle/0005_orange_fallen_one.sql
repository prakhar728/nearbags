CREATE TABLE "agent_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"basket_id" integer NOT NULL,
	"trigger" text NOT NULL,
	"status" text DEFAULT 'deciding' NOT NULL,
	"weights_before" jsonb,
	"weights_after" jsonb,
	"reason" text,
	"model" text,
	"decide_tx" text,
	"orders" jsonb,
	"sign_txs" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "baskets" ADD COLUMN "agent" jsonb;--> statement-breakpoint
ALTER TABLE "positions" ADD COLUMN "agent_key_added_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "positions" ADD COLUMN "agent_public_key" text;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_basket_id_baskets_id_fk" FOREIGN KEY ("basket_id") REFERENCES "public"."baskets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_runs_basket_idx" ON "agent_runs" USING btree ("basket_id","created_at");