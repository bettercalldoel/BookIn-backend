ALTER TABLE "properties"
ADD COLUMN "amenity_keys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX "idx_properties_amenity_keys_gin"
ON "properties"
USING GIN ("amenity_keys");
