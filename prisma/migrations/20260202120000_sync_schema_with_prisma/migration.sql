-- Align Supabase schema to Prisma models

-- Guard against too-long names before shrinking varchar sizes
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM properties WHERE length(name) > 160) THEN
    RAISE EXCEPTION 'properties.name exceeds 160 chars; shorten before migration.';
  END IF;

  IF EXISTS (SELECT 1 FROM room_types WHERE length(name) > 120) THEN
    RAISE EXCEPTION 'room_types.name exceeds 120 chars; shorten before migration.';
  END IF;
END $$;

-- Backfill required text fields
UPDATE properties
SET description = ''
WHERE description IS NULL;

UPDATE room_types
SET description = ''
WHERE description IS NULL;

-- Ensure tenant_id is present before enforcing NOT NULL
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM property_categories WHERE tenant_id IS NULL) THEN
    RAISE EXCEPTION 'property_categories.tenant_id contains NULLs; backfill before migration.';
  END IF;
END $$;

-- Apply column constraints/types to match Prisma
ALTER TABLE properties
  ALTER COLUMN name TYPE varchar(160),
  ALTER COLUMN description SET NOT NULL;

ALTER TABLE room_types
  ALTER COLUMN name TYPE varchar(120),
  ALTER COLUMN description SET NOT NULL;

ALTER TABLE property_categories
  ALTER COLUMN tenant_id SET NOT NULL;

-- Drop columns that are not in Prisma schema
ALTER TABLE properties
  DROP COLUMN IF EXISTS latitude,
  DROP COLUMN IF EXISTS longitude,
  DROP COLUMN IF EXISTS max_guests,
  DROP COLUMN IF EXISTS is_active;

ALTER TABLE room_types
  DROP COLUMN IF EXISTS is_active;
