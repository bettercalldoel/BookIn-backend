ALTER TABLE "properties"
ADD COLUMN "breakfast_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "breakfast_price_per_pax" DECIMAL NOT NULL DEFAULT 0,
ADD COLUMN "breakfast_currency" VARCHAR(3) NOT NULL DEFAULT 'IDR',
ADD COLUMN "breakfast_updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "bookings"
ADD COLUMN "room_subtotal" DECIMAL NOT NULL DEFAULT 0,
ADD COLUMN "breakfast_selected" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "breakfast_pax" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "breakfast_unit_price" DECIMAL NOT NULL DEFAULT 0,
ADD COLUMN "breakfast_nights" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "breakfast_total" DECIMAL NOT NULL DEFAULT 0,
ADD COLUMN "subtotal_amount" DECIMAL NOT NULL DEFAULT 0,
ADD COLUMN "app_fee_rate" DECIMAL NOT NULL DEFAULT 0.02,
ADD COLUMN "app_fee_amount" DECIMAL NOT NULL DEFAULT 0,
ADD COLUMN "tax_rate" DECIMAL NOT NULL DEFAULT 0.11,
ADD COLUMN "tax_amount" DECIMAL NOT NULL DEFAULT 0,
ADD COLUMN "tenant_fee_rate" DECIMAL NOT NULL DEFAULT 0.05,
ADD COLUMN "tenant_fee_amount" DECIMAL NOT NULL DEFAULT 0,
ADD COLUMN "tenant_payout_amount" DECIMAL NOT NULL DEFAULT 0,
ADD COLUMN "currency" VARCHAR(3) NOT NULL DEFAULT 'IDR',
ADD COLUMN "pricing_version" INTEGER NOT NULL DEFAULT 1;

UPDATE "bookings"
SET
  "room_subtotal" = COALESCE("total_amount", 0),
  "breakfast_selected" = false,
  "breakfast_pax" = 0,
  "breakfast_unit_price" = 0,
  "breakfast_nights" = 0,
  "breakfast_total" = 0,
  "subtotal_amount" = COALESCE("total_amount", 0),
  "app_fee_rate" = 0.02,
  "app_fee_amount" = 0,
  "tax_rate" = 0.11,
  "tax_amount" = 0,
  "tenant_fee_rate" = 0.05,
  "tenant_fee_amount" = 0,
  "tenant_payout_amount" = COALESCE("total_amount", 0),
  "currency" = 'IDR',
  "pricing_version" = 1;

ALTER TABLE "properties"
ADD CONSTRAINT "chk_properties_breakfast_price_non_negative"
CHECK ("breakfast_price_per_pax" >= 0);

ALTER TABLE "bookings"
ADD CONSTRAINT "chk_bookings_breakfast_pax_non_negative"
CHECK ("breakfast_pax" >= 0),
ADD CONSTRAINT "chk_bookings_breakfast_pax_leq_guests"
CHECK ("breakfast_pax" <= "guests"),
ADD CONSTRAINT "chk_bookings_amount_non_negative"
CHECK (
  "room_subtotal" >= 0
  AND "breakfast_unit_price" >= 0
  AND "breakfast_total" >= 0
  AND "subtotal_amount" >= 0
  AND "app_fee_amount" >= 0
  AND "tax_amount" >= 0
  AND "tenant_fee_amount" >= 0
  AND "tenant_payout_amount" >= 0
  AND "total_amount" >= 0
),
ADD CONSTRAINT "chk_bookings_breakfast_consistency"
CHECK (
  (
    "breakfast_selected" = false
    AND "breakfast_pax" = 0
    AND "breakfast_nights" = 0
    AND "breakfast_total" = 0
  )
  OR (
    "breakfast_selected" = true
    AND "breakfast_pax" >= 1
    AND "breakfast_nights" >= 1
  )
);
