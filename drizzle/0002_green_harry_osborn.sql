ALTER TABLE "order_legs" ADD COLUMN "payload" text;--> statement-breakpoint
ALTER TABLE "order_legs" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "gross_usdc" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "usdc_start" text;