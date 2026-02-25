export const PROPERTY_AMENITY_KEYS = [
  "wifi",
  "air_conditioning",
  "private_bathroom",
  "hot_water",
  "television",
  "workspace",
  "breakfast",
  "kitchen",
  "refrigerator",
  "parking",
  "elevator",
  "wheelchair_access",
  "front_desk_24h",
  "cctv",
  "smoke_detector",
  "fire_extinguisher",
  "swimming_pool",
  "gym",
  "playground",
  "family_room",
  "extra_bed",
  "baby_cot",
  "pet_friendly",
  "non_smoking_room",
  "smoking_area",
  "laundry_service",
  "airport_shuttle",
  "daily_housekeeping",
] as const;

export type PropertyAmenityKey = (typeof PROPERTY_AMENITY_KEYS)[number];

export const PROPERTY_AMENITY_KEY_SET = new Set<string>(PROPERTY_AMENITY_KEYS);
