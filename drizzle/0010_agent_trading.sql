ALTER TABLE "agent_keys" ADD COLUMN "trade_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_keys" ADD COLUMN "trade_daily_usd" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_keys" ADD COLUMN "trade_any_bag" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_keys" ADD COLUMN "trade_basket_ids" integer[] DEFAULT '{}'::integer[] NOT NULL;--> statement-breakpoint
ALTER TABLE "positions" ADD COLUMN "agent_key_id" integer;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_agent_key_id_agent_keys_id_fk" FOREIGN KEY ("agent_key_id") REFERENCES "public"."agent_keys"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "positions_agent_basket_uq" ON "positions" USING btree ("agent_key_id","basket_id") WHERE "positions"."kind" = 'agent';