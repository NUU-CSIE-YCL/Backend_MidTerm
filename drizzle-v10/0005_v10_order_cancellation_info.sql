ALTER TABLE "bf_v10"."orders"
  ADD COLUMN IF NOT EXISTS "cancel_reason" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "bf_v10"."orders"
  ADD COLUMN IF NOT EXISTS "cancelled_by" text REFERENCES "bf_v10"."user"("id");
--> statement-breakpoint
ALTER TABLE "bf_v10"."orders"
  ADD COLUMN IF NOT EXISTS "cancelled_at" timestamp with time zone;
