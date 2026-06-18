ALTER TABLE "bf_v10"."menu_items"
  ADD COLUMN IF NOT EXISTS "is_sold_out" boolean DEFAULT false NOT NULL;

ALTER TABLE "bf_v10"."menu_items"
  ADD COLUMN IF NOT EXISTS "is_hidden" boolean DEFAULT false NOT NULL;
