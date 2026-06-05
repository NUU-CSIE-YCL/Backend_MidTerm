ALTER TABLE "bf_v10"."user"
  ADD COLUMN IF NOT EXISTS "roles" text[] DEFAULT ARRAY['customer']::text[];
--> statement-breakpoint
UPDATE "bf_v10"."user"
SET "roles" = ARRAY['customer']::text[]
WHERE "roles" IS NULL OR cardinality("roles") = 0;
--> statement-breakpoint
ALTER TABLE "bf_v10"."user"
  ALTER COLUMN "roles" SET DEFAULT ARRAY['customer']::text[];
--> statement-breakpoint
ALTER TABLE "bf_v10"."user"
  ALTER COLUMN "roles" SET NOT NULL;
