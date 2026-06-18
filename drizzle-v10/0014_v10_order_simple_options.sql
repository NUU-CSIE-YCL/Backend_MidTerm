ALTER TABLE "bf_v10"."orders"
  ADD COLUMN IF NOT EXISTS "pickup_time" text NOT NULL DEFAULT '';

ALTER TABLE "bf_v10"."order_items"
  ADD COLUMN IF NOT EXISTS "add_egg" boolean NOT NULL DEFAULT false;
