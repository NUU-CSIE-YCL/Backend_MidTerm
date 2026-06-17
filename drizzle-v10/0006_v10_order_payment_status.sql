ALTER TABLE "bf_v10"."orders"
  ADD COLUMN IF NOT EXISTS "payment_status" text DEFAULT 'unpaid' NOT NULL;

ALTER TABLE "bf_v10"."orders"
  ADD COLUMN IF NOT EXISTS "paid_by" text REFERENCES "bf_v10"."user"("id");

ALTER TABLE "bf_v10"."orders"
  ADD COLUMN IF NOT EXISTS "paid_at" timestamp with time zone;
