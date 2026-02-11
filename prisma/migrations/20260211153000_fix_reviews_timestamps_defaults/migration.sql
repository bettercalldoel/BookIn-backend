-- Ensure review timestamps are always writable even on older schemas.

ALTER TABLE IF EXISTS "reviews"
  ADD COLUMN IF NOT EXISTS "created_at" timestamptz(6),
  ADD COLUMN IF NOT EXISTS "updated_at" timestamptz(6);

UPDATE "reviews"
SET "created_at" = COALESCE("created_at", now())
WHERE "created_at" IS NULL;

UPDATE "reviews"
SET "updated_at" = COALESCE("updated_at", "created_at", now())
WHERE "updated_at" IS NULL;

ALTER TABLE IF EXISTS "reviews"
  ALTER COLUMN "created_at" SET DEFAULT now(),
  ALTER COLUMN "created_at" SET NOT NULL,
  ALTER COLUMN "updated_at" SET DEFAULT now(),
  ALTER COLUMN "updated_at" SET NOT NULL;
