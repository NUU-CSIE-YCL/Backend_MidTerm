alter table "bf_v10"."menu_items"
  add column if not exists "experiment_key" text not null default '';

alter table "bf_v10"."menu_items"
  add column if not exists "experiment_variant" text not null default '';
