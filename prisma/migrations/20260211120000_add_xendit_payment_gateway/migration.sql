ALTER TYPE "payment_method" ADD VALUE IF NOT EXISTS 'XENDIT';

ALTER TABLE "bookings"
  ADD COLUMN IF NOT EXISTS "payment_method" "payment_method" NOT NULL DEFAULT 'MANUAL_TRANSFER',
  ADD COLUMN IF NOT EXISTS "xendit_invoice_id" TEXT,
  ADD COLUMN IF NOT EXISTS "xendit_invoice_url" TEXT,
  ADD COLUMN IF NOT EXISTS "xendit_invoice_status" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_bookings_xendit_invoice_id"
  ON "bookings" ("xendit_invoice_id");
