ALTER TABLE "bf_v10"."menu_items"
  ADD COLUMN IF NOT EXISTS "display_order" integer DEFAULT 0 NOT NULL;

WITH current_items AS (
  SELECT
    id,
    row_number() OVER (ORDER BY logical_id ASC, id ASC) AS next_order
  FROM "bf_v10"."menu_items"
  WHERE is_current_version = true
)
UPDATE "bf_v10"."menu_items" AS menu_items
SET display_order = current_items.next_order
FROM current_items
WHERE menu_items.id = current_items.id
  AND menu_items.display_order = 0;

WITH version_orders AS (
  SELECT logical_id, max(display_order) AS display_order
  FROM "bf_v10"."menu_items"
  WHERE is_current_version = true
  GROUP BY logical_id
)
UPDATE "bf_v10"."menu_items" AS menu_items
SET display_order = version_orders.display_order
FROM version_orders
WHERE menu_items.logical_id = version_orders.logical_id
  AND menu_items.is_current_version = false
  AND menu_items.display_order = 0;
