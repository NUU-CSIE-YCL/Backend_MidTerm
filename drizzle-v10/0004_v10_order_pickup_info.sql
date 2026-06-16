ALTER TABLE "bf_v10"."orders"
  ADD COLUMN IF NOT EXISTS "customer_note" text DEFAULT '' NOT NULL;
