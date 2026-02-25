-- CreateEnum
CREATE TYPE "public"."AuthProvider" AS ENUM ('EMAIL', 'GOOGLE', 'FACEBOOK', 'TWITTER');

-- CreateEnum
CREATE TYPE "public"."adjustment_type" AS ENUM ('PERCENT', 'NOMINAL');

-- CreateEnum
CREATE TYPE "public"."rate_scope" AS ENUM ('PROPERTY', 'ROOM_TYPE');

-- DropForeignKey
ALTER TABLE "public"."cities" DROP CONSTRAINT "cities_province_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."properties" DROP CONSTRAINT "properties_category_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."properties" DROP CONSTRAINT "properties_city_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."properties" DROP CONSTRAINT "properties_tenant_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."property_categories" DROP CONSTRAINT "property_categories_tenant_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."reviews" DROP CONSTRAINT "reviews_booking_id_fkey";

-- DropIndex
DROP INDEX "public"."idx_accounts_type";

-- DropIndex
DROP INDEX "public"."idx_booking_nights_booking";

-- DropIndex
DROP INDEX "public"."idx_bookings_check_in";

-- DropIndex
DROP INDEX "public"."idx_bookings_check_out";

-- DropIndex
DROP INDEX "public"."idx_bookings_created";

-- DropIndex
DROP INDEX "public"."idx_bookings_payment_due";

-- DropIndex
DROP INDEX "public"."idx_bookings_proof_due";

-- DropIndex
DROP INDEX "public"."idx_bookings_room_type";

-- DropIndex
DROP INDEX "public"."idx_bookings_status";

-- DropIndex
DROP INDEX "public"."idx_bookings_user";

-- DropIndex
DROP INDEX "public"."idx_cities_name";

-- DropIndex
DROP INDEX "public"."idx_payment_proofs_booking";

-- DropIndex
DROP INDEX "public"."idx_properties_name";

-- DropIndex
DROP INDEX "public"."idx_property_categories_active";

-- DropIndex
DROP INDEX "public"."idx_property_categories_tenant";

-- AlterTable
ALTER TABLE "public"."booking_nights" ALTER COLUMN "base_price" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "adjustment_amount" SET DEFAULT 0,
ALTER COLUMN "adjustment_amount" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "final_price" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "public"."bookings" ALTER COLUMN "base_total" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "adjustment_total" SET DEFAULT 0,
ALTER COLUMN "adjustment_total" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "total_amount" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "public"."cities" ALTER COLUMN "country" SET NOT NULL,
ALTER COLUMN "country" SET DEFAULT 'Indonesia';

-- AlterTable
ALTER TABLE "public"."oauth_accounts" ALTER COLUMN "provider_user_id" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "public"."payment_proofs" ALTER COLUMN "method" SET DEFAULT 'MANUAL_TRANSFER';

-- AlterTable
ALTER TABLE "public"."rate_rules" ADD COLUMN     "label" TEXT,
ADD COLUMN     "priority" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "tenant_id" UUID NOT NULL,
ADD COLUMN     "value" DECIMAL(12,2) NOT NULL,
DROP COLUMN "scope",
ADD COLUMN     "scope" "public"."rate_scope" NOT NULL,
DROP COLUMN "adjustment_type",
ADD COLUMN     "adjustment_type" "public"."adjustment_type" NOT NULL;

-- AlterTable
ALTER TABLE "public"."reviews" ADD COLUMN     "property_id" UUID NOT NULL,
ADD COLUMN     "replied_at" TIMESTAMPTZ(6),
ADD COLUMN     "room_type_id" UUID NOT NULL,
ADD COLUMN     "tenant_id" UUID NOT NULL,
ADD COLUMN     "user_id" UUID NOT NULL,
ALTER COLUMN "rating" DROP NOT NULL,
ALTER COLUMN "rating" SET DATA TYPE SMALLINT;

-- AlterTable
ALTER TABLE "public"."room_types" ALTER COLUMN "base_price" SET DATA TYPE DECIMAL(12,2);

-- CreateTable
CREATE TABLE "public"."kv_store_43b4e72b" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,

    CONSTRAINT "kv_store_43b4e72b_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "public"."room_blockouts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "room_type_id" UUID NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "blocked_units" INTEGER,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_blockouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."room_images" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "room_type_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "room_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "kv_store_43b4e72b_key_idx" ON "public"."kv_store_43b4e72b"("key" ASC);

-- CreateIndex
CREATE INDEX "idx_room_blockouts_room_type_dates" ON "public"."room_blockouts"("room_type_id" ASC, "start_date" ASC, "end_date" ASC);

-- CreateIndex
CREATE INDEX "idx_room_images_room_type_id" ON "public"."room_images"("room_type_id" ASC);

-- CreateIndex
CREATE INDEX "idx_bookings_payment_due" ON "public"."bookings"("status" ASC, "payment_due_at" ASC);

-- CreateIndex
CREATE INDEX "idx_bookings_proof_due" ON "public"."bookings"("status" ASC, "proof_due_at" ASC);

-- CreateIndex
CREATE INDEX "idx_bookings_tenant_status_date" ON "public"."bookings"("tenant_id" ASC, "status" ASC, "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_bookings_user_date" ON "public"."bookings"("user_id" ASC, "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "cities_name_province_country_key" ON "public"."cities"("name" ASC, "province" ASC, "country" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "oauth_accounts_account_id_provider_key" ON "public"."oauth_accounts"("account_id" ASC, "provider" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "payment_proofs_booking_id_key" ON "public"."payment_proofs"("booking_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ux_property_categories_tenant_name" ON "public"."property_categories"("tenant_id" ASC, "name" ASC) WHERE (tenant_id IS NOT NULL);

-- CreateIndex
CREATE UNIQUE INDEX "provinces_name_key" ON "public"."provinces"("name" ASC);

-- CreateIndex
CREATE INDEX "idx_rate_rules_property_dates" ON "public"."rate_rules"("property_id" ASC, "start_date" ASC, "end_date" ASC) WHERE (scope = 'PROPERTY'::rate_scope);

-- CreateIndex
CREATE INDEX "idx_rate_rules_room_type_dates" ON "public"."rate_rules"("room_type_id" ASC, "start_date" ASC, "end_date" ASC) WHERE (scope = 'ROOM_TYPE'::rate_scope);

-- CreateIndex
CREATE INDEX "idx_reviews_property_id" ON "public"."reviews"("property_id" ASC, "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_reviews_tenant_id" ON "public"."reviews"("tenant_id" ASC, "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_room_types_base_price" ON "public"."room_types"("base_price" ASC);

-- AddForeignKey
ALTER TABLE "public"."properties" ADD CONSTRAINT "properties_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."property_categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."properties" ADD CONSTRAINT "properties_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."properties" ADD CONSTRAINT "properties_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."property_categories" ADD CONSTRAINT "property_categories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."rate_rules" ADD CONSTRAINT "rate_rules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."reviews" ADD CONSTRAINT "reviews_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."reviews" ADD CONSTRAINT "reviews_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."reviews" ADD CONSTRAINT "reviews_room_type_id_fkey" FOREIGN KEY ("room_type_id") REFERENCES "public"."room_types"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."reviews" ADD CONSTRAINT "reviews_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."accounts"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."reviews" ADD CONSTRAINT "reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."accounts"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."room_blockouts" ADD CONSTRAINT "room_blockouts_room_type_id_fkey" FOREIGN KEY ("room_type_id") REFERENCES "public"."room_types"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."room_images" ADD CONSTRAINT "room_images_room_type_id_fkey" FOREIGN KEY ("room_type_id") REFERENCES "public"."room_types"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- RenameIndex
ALTER INDEX "public"."idx_booking_nights_date" RENAME TO "idx_booking_nights_stay_date";

-- RenameIndex
ALTER INDEX "public"."idx_evt_account" RENAME TO "idx_evt_account_id";

-- RenameIndex
ALTER INDEX "public"."idx_evt_expires" RENAME TO "idx_evt_expires_at";

-- RenameIndex
ALTER INDEX "public"."idx_oauth_accounts_account" RENAME TO "idx_oauth_account_account_id";

-- RenameIndex
ALTER INDEX "public"."uq_oauth_provider_user" RENAME TO "oauth_accounts_provider_provider_user_id_key";

-- RenameIndex
ALTER INDEX "public"."idx_prt_account" RENAME TO "idx_prt_account_id";

-- RenameIndex
ALTER INDEX "public"."idx_prt_expires" RENAME TO "idx_prt_expires_at";

-- RenameIndex
ALTER INDEX "public"."idx_properties_category" RENAME TO "idx_properties_category_id";

-- RenameIndex
ALTER INDEX "public"."idx_properties_city" RENAME TO "idx_properties_city_id";

-- RenameIndex
ALTER INDEX "public"."idx_properties_tenant" RENAME TO "idx_properties_tenant_id";

-- RenameIndex
ALTER INDEX "public"."idx_property_images_property" RENAME TO "idx_property_images_property_id";

-- RenameIndex
ALTER INDEX "public"."idx_room_types_property" RENAME TO "idx_room_types_property_id";

-- RenameIndex
ALTER INDEX "public"."uq_room_types_property_name" RENAME TO "room_types_property_id_name_key";

