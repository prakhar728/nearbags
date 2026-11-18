CREATE TABLE "leases" (
	"key" text PRIMARY KEY NOT NULL,
	"until" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"hits" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gifts" ADD COLUMN "moved" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX "fees_order_kind_uq" ON "fee_events" USING btree ("order_id","recipient_kind");--> statement-breakpoint
CREATE UNIQUE INDEX "legs_order_seq_uq" ON "order_legs" USING btree ("order_id","seq");--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "session_version" integer DEFAULT 0 NOT NULL;