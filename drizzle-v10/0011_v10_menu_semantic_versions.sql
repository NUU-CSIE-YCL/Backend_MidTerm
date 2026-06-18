alter table "bf_v10"."menu_items"
  add column if not exists "major_version" integer not null default 1;

alter table "bf_v10"."menu_items"
  add column if not exists "minor_version" integer not null default 0;

alter table "bf_v10"."menu_items"
  add column if not exists "version_note" text not null default '';
