alter table "bf_v10"."menu_items"
  add column if not exists "sale_price" integer;

alter table "bf_v10"."menu_items"
  add column if not exists "promotion_label" text not null default '';
