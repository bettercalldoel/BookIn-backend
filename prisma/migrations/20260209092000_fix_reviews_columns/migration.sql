-- Keep reviews table compatible with Prisma model fields.

ALTER TABLE IF EXISTS "reviews"
  ADD COLUMN IF NOT EXISTS "tenant_replied_at" timestamptz(6);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'reviews'
      AND column_name = 'replied_at'
  ) THEN
    UPDATE "reviews"
    SET "tenant_replied_at" = "replied_at"
    WHERE "tenant_replied_at" IS NULL
      AND "replied_at" IS NOT NULL;
  END IF;
END $$;

ALTER TABLE IF EXISTS "reviews"
  ADD COLUMN IF NOT EXISTS "updated_at" timestamptz(6);

UPDATE "reviews"
SET "updated_at" = COALESCE("updated_at", "created_at", now())
WHERE "updated_at" IS NULL;

ALTER TABLE IF EXISTS "reviews"
  ALTER COLUMN "updated_at" SET DEFAULT now(),
  ALTER COLUMN "updated_at" SET NOT NULL;
