-- Add enums and tables for rate rules and room calendar

DO $$
BEGIN
  CREATE TYPE "AdjustmentType" AS ENUM ('PERCENT', 'NOMINAL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "RateScope" AS ENUM ('PROPERTY', 'ROOM_TYPE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "rate_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_account_id" uuid NOT NULL,
  "scope" "RateScope" NOT NULL,
  "property_id" uuid,
  "room_type_id" uuid,
  "name" varchar(160) NOT NULL,
  "start_date" date NOT NULL,
  "end_date" date NOT NULL,
  "adjustment_type" "AdjustmentType" NOT NULL,
  "adjustment_value" numeric NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE "rate_rules"
  ADD COLUMN IF NOT EXISTS "tenant_account_id" uuid,
  ADD COLUMN IF NOT EXISTS "scope" "RateScope",
  ADD COLUMN IF NOT EXISTS "property_id" uuid,
  ADD COLUMN IF NOT EXISTS "room_type_id" uuid,
  ADD COLUMN IF NOT EXISTS "name" varchar(160),
  ADD COLUMN IF NOT EXISTS "start_date" date,
  ADD COLUMN IF NOT EXISTS "end_date" date,
  ADD COLUMN IF NOT EXISTS "adjustment_type" "AdjustmentType",
  ADD COLUMN IF NOT EXISTS "adjustment_value" numeric,
  ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS "created_at" timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS "updated_at" timestamptz DEFAULT now();

ALTER TABLE "rate_rules"
  ALTER COLUMN "tenant_account_id" SET NOT NULL,
  ALTER COLUMN "scope" SET NOT NULL,
  ALTER COLUMN "name" SET NOT NULL,
  ALTER COLUMN "start_date" SET NOT NULL,
  ALTER COLUMN "end_date" SET NOT NULL,
  ALTER COLUMN "adjustment_type" SET NOT NULL,
  ALTER COLUMN "adjustment_value" SET NOT NULL,
  ALTER COLUMN "is_active" SET NOT NULL,
  ALTER COLUMN "created_at" SET NOT NULL,
  ALTER COLUMN "updated_at" SET NOT NULL;

DO $$
BEGIN
  ALTER TABLE "rate_rules"
    ADD CONSTRAINT "rate_rules_tenant_account_id_fkey"
    FOREIGN KEY ("tenant_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "rate_rules"
    ADD CONSTRAINT "rate_rules_property_id_fkey"
    FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "rate_rules"
    ADD CONSTRAINT "rate_rules_room_type_id_fkey"
    FOREIGN KEY ("room_type_id") REFERENCES "room_types"("id") ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "idx_rate_rules_tenant" ON "rate_rules" ("tenant_account_id");
CREATE INDEX IF NOT EXISTS "idx_rate_rules_property" ON "rate_rules" ("property_id");
CREATE INDEX IF NOT EXISTS "idx_rate_rules_room_type" ON "rate_rules" ("room_type_id");

CREATE TABLE IF NOT EXISTS "room_type_calendar" (
  "room_type_id" uuid NOT NULL,
  "date" date NOT NULL,
  "available_units" integer NOT NULL,
  "price" numeric NOT NULL,
  "is_closed" boolean NOT NULL DEFAULT false,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "pk_room_calendar" PRIMARY KEY ("room_type_id", "date")
);

ALTER TABLE "room_type_calendar"
  ADD COLUMN IF NOT EXISTS "room_type_id" uuid,
  ADD COLUMN IF NOT EXISTS "date" date,
  ADD COLUMN IF NOT EXISTS "available_units" integer,
  ADD COLUMN IF NOT EXISTS "price" numeric,
  ADD COLUMN IF NOT EXISTS "is_closed" boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS "updated_at" timestamptz DEFAULT now();

ALTER TABLE "room_type_calendar"
  ALTER COLUMN "room_type_id" SET NOT NULL,
  ALTER COLUMN "date" SET NOT NULL,
  ALTER COLUMN "available_units" SET NOT NULL,
  ALTER COLUMN "price" SET NOT NULL,
  ALTER COLUMN "is_closed" SET NOT NULL,
  ALTER COLUMN "updated_at" SET NOT NULL;

DO $$
BEGIN
  ALTER TABLE "room_type_calendar"
    ADD CONSTRAINT "room_type_calendar_room_type_id_fkey"
    FOREIGN KEY ("room_type_id") REFERENCES "room_types"("id") ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "idx_room_type_calendar_date" ON "room_type_calendar" ("date");
CREATE INDEX IF NOT EXISTS "idx_room_calendar_room_date" ON "room_type_calendar" ("room_type_id", "date");
