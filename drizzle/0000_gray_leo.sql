CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"target" text,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_nonces" (
	"nonce" text PRIMARY KEY NOT NULL,
	"expires_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "basket_assets" (
	"basket_id" integer NOT NULL,
	"asset_id" text NOT NULL,
	"weight_bps" integer NOT NULL,
	"why" text NOT NULL,
	CONSTRAINT "basket_assets_basket_id_asset_id_pk" PRIMARY KEY("basket_id","asset_id")
);
--> statement-breakpoint
CREATE TABLE "basket_edits" (
	"id" serial PRIMARY KEY NOT NULL,
	"basket_id" integer NOT NULL,
	"field" text NOT NULL,
	"old_value" text,
	"new_value" text,
	"edited_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "baskets" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"creator_id" integer NOT NULL,
	"name" text NOT NULL,
	"tagline" text NOT NULL,
	"thesis" text NOT NULL,
	"risks" text NOT NULL,
	"horizon" text NOT NULL,
	"exit_signal" text,
	"deep_dive" text,
	"fee_bps" integer NOT NULL,
	"is_house" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"hidden_reason" text,
	"published_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fee_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"recipient_kind" text NOT NULL,
	"recipient_account" text NOT NULL,
	"asset" text NOT NULL,
	"amount" text NOT NULL,
	"tx_hash" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_legs" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"seq" integer NOT NULL,
	"asset_from" text NOT NULL,
	"asset_to" text NOT NULL,
	"amount_in" text NOT NULL,
	"amount_out_expected" text,
	"amount_out_actual" text,
	"deposit_address" text,
	"intent_hash" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"quote" jsonb,
	"guard" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"position_id" integer NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"pay_asset" text,
	"pay_amount" text,
	"payout_address" text,
	"refund_address" text,
	"usd_in" double precision,
	"usd_out" double precision,
	"sell_pct" integer,
	"funding_deposit_address" text,
	"funding_deposit_memo" text,
	"funding_quote" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"basket_id" integer NOT NULL,
	"account_id" text NOT NULL,
	"key_mode" text NOT NULL,
	"recovery_key_added_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_daily" (
	"source" text NOT NULL,
	"ticker" text NOT NULL,
	"date" date NOT NULL,
	"close" double precision NOT NULL,
	CONSTRAINT "price_daily_source_ticker_date_pk" PRIMARY KEY("source","ticker","date")
);
--> statement-breakpoint
CREATE TABLE "price_median" (
	"ticker" text NOT NULL,
	"date" date NOT NULL,
	"close" double precision NOT NULL,
	"sources_used" text[] NOT NULL,
	"flagged" text[] DEFAULT '{}'::text[] NOT NULL,
	CONSTRAINT "price_median_ticker_date_pk" PRIMARY KEY("ticker","date")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"basket_id" integer NOT NULL,
	"taken_at" timestamp with time zone DEFAULT now() NOT NULL,
	"tvl_usd" double precision NOT NULL,
	"holders" integer NOT NULL,
	"index_value" double precision
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"wallet_chain" text NOT NULL,
	"wallet_address" text NOT NULL,
	"wallet_pubkey" text,
	"key_mode" text,
	"handle" text,
	"bio" text,
	"x_url" text,
	"is_admin" boolean DEFAULT false NOT NULL,
	"accepted_risk_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "basket_assets" ADD CONSTRAINT "basket_assets_basket_id_baskets_id_fk" FOREIGN KEY ("basket_id") REFERENCES "public"."baskets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basket_edits" ADD CONSTRAINT "basket_edits_basket_id_baskets_id_fk" FOREIGN KEY ("basket_id") REFERENCES "public"."baskets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baskets" ADD CONSTRAINT "baskets_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_events" ADD CONSTRAINT "fee_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_legs" ADD CONSTRAINT "order_legs_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_basket_id_baskets_id_fk" FOREIGN KEY ("basket_id") REFERENCES "public"."baskets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snapshots" ADD CONSTRAINT "snapshots_basket_id_baskets_id_fk" FOREIGN KEY ("basket_id") REFERENCES "public"."baskets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "baskets_slug_uq" ON "baskets" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "baskets_status_idx" ON "baskets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "legs_order_idx" ON "order_legs" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "orders_position_idx" ON "orders" USING btree ("position_id");--> statement-breakpoint
CREATE UNIQUE INDEX "positions_account_uq" ON "positions" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "positions_user_basket_uq" ON "positions" USING btree ("user_id","basket_id");--> statement-breakpoint
CREATE INDEX "snapshots_basket_idx" ON "snapshots" USING btree ("basket_id","taken_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_wallet_uq" ON "users" USING btree ("wallet_chain","wallet_address");--> statement-breakpoint
CREATE UNIQUE INDEX "users_handle_uq" ON "users" USING btree ("handle");