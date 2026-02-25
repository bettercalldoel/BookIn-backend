import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required.");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const limitArg = args.find((arg) => arg.startsWith("--limit="));
const delayArg = args.find((arg) => arg.startsWith("--delay-ms="));
const maxRows =
  limitArg && Number.isFinite(Number(limitArg.split("=")[1]))
    ? Math.max(1, Number(limitArg.split("=")[1]))
    : null;
const delayMs =
  delayArg && Number.isFinite(Number(delayArg.split("=")[1]))
    ? Math.max(0, Number(delayArg.split("=")[1]))
    : 800;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const parseCoordinate = (value, min, max) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < min || parsed > max) return null;
  return parsed;
};

const geocodeLocation = async (query) => {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("addressdetails", "0");

  const response = await fetch(url.toString(), {
    headers: {
      "Accept-Language": "id,en",
      "User-Agent": "BookIn/1.0 (backfill-property-coordinates)",
    },
  });
  if (!response.ok) {
    return null;
  }

  const payload = await response.json();
  const firstResult = payload?.[0];
  const latitude = parseCoordinate(firstResult?.lat, -90, 90);
  const longitude = parseCoordinate(firstResult?.lon, -180, 180);
  if (latitude === null || longitude === null) {
    return null;
  }

  return {
    latitude: latitude.toFixed(7),
    longitude: longitude.toFixed(7),
  };
};

const buildLocationQueryCandidates = (property) => {
  const address = property.address?.trim() ?? "";
  const cityName = property.city?.name?.trim() ?? "";
  const province =
    property.city?.province?.name?.trim() ??
    property.city?.provinceName?.trim() ??
    "";
  const country = property.city?.country?.trim() ?? "Indonesia";

  const candidates = [
    [address, cityName, province, country].filter(Boolean).join(", "),
    [address, cityName, country].filter(Boolean).join(", "),
    address,
    [cityName, province, country].filter(Boolean).join(", "),
    [property.name?.trim(), cityName, province, country]
      .filter(Boolean)
      .join(", "),
  ]
    .map((query) => query.trim())
    .filter((query) => query.length > 0);

  return Array.from(new Set(candidates));
};

async function run() {
  const pendingProperties = await prisma.property.findMany({
    where: {
      OR: [{ latitude: null }, { longitude: null }],
    },
    orderBy: { createdAt: "asc" },
    take: maxRows ?? undefined,
    select: {
      id: true,
      name: true,
      address: true,
      city: {
        select: {
          name: true,
          provinceName: true,
          country: true,
          province: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  });

  if (pendingProperties.length === 0) {
    console.log("Tidak ada properti yang perlu dibackfill.");
    return;
  }

  console.log(
    `Memproses ${pendingProperties.length} properti (dry-run: ${dryRun ? "ya" : "tidak"}).`,
  );

  let updatedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (let index = 0; index < pendingProperties.length; index += 1) {
    const property = pendingProperties[index];
    const queryCandidates = buildLocationQueryCandidates(property);

    if (queryCandidates.length === 0) {
      skippedCount += 1;
      console.log(
        `[${index + 1}/${pendingProperties.length}] SKIP ${property.id} (${property.name}) - lokasi kosong`,
      );
      continue;
    }

    try {
      let coordinates = null;
      for (const queryCandidate of queryCandidates) {
        coordinates = await geocodeLocation(queryCandidate);
        if (coordinates) break;
      }
      if (!coordinates) {
        skippedCount += 1;
        console.log(
          `[${index + 1}/${pendingProperties.length}] SKIP ${property.id} (${property.name}) - koordinat tidak ditemukan`,
        );
      } else {
        if (!dryRun) {
          await prisma.property.update({
            where: { id: property.id },
            data: {
              latitude: coordinates.latitude,
              longitude: coordinates.longitude,
            },
          });
        }
        updatedCount += 1;
        console.log(
          `[${index + 1}/${pendingProperties.length}] OK ${property.id} (${property.name}) -> ${coordinates.latitude}, ${coordinates.longitude}`,
        );
      }
    } catch (error) {
      failedCount += 1;
      console.log(
        `[${index + 1}/${pendingProperties.length}] FAIL ${property.id} (${property.name}) - ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
    }

    if (index < pendingProperties.length - 1 && delayMs > 0) {
      await sleep(delayMs);
    }
  }

  console.log("");
  console.log("Ringkasan backfill:");
  console.log(`- Updated: ${updatedCount}`);
  console.log(`- Skipped: ${skippedCount}`);
  console.log(`- Failed : ${failedCount}`);
}

run()
  .catch((error) => {
    console.error("Backfill gagal:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
