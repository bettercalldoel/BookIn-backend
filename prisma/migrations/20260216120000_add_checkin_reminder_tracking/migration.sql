ALTER TABLE IF EXISTS "bookings"
  ADD COLUMN IF NOT EXISTS "check_in_reminder_sent_at" timestamptz(6);
