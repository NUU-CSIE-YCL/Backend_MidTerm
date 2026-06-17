ALTER TABLE "bf_v10"."orders"
  ADD COLUMN IF NOT EXISTS "refund_reason" text DEFAULT '' NOT NULL;

ALTER TABLE "bf_v10"."orders"
  ADD COLUMN IF NOT EXISTS "refunded_by" text REFERENCES "bf_v10"."user"("id");

ALTER TABLE "bf_v10"."orders"
  ADD COLUMN IF NOT EXISTS "refunded_at" timestamp with time zone;
