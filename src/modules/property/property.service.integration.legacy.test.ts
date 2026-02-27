import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "../../lib/prisma.js";
import {
  cleanupTracker,
  createTenant,
  createTracker,
  service,
  toDate,
  uniqueSuffix,
} from "./property.service.integration.helpers.js";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for integration tests.");
}

test("[integration] listPublicProperties kompatibel dengan start_date + end_date legacy", async () => {
  const tracker = createTracker();
  const suffix = uniqueSuffix();

  try {
    const tenantId = await createTenant(`legacy_${suffix}`);
    tracker.accountId = tenantId;

    const city = await prisma.city.create({
      data: { name: `IT Legacy City ${suffix}`, provinceName: "DI Yogyakarta", country: "Indonesia" },
      select: { id: true },
    });
    tracker.cityIds.push(city.id);

    const category = await prisma.propertyCategory.create({
      data: { tenantAccountId: tenantId, name: `IT Legacy Resort ${suffix}` },
      select: { id: true },
    });
    tracker.categoryIds.push(category.id);

    const property = await prisma.property.create({
      data: { tenantAccountId: tenantId, categoryId: category.id, cityId: city.id, name: `IT Legacy Beach ${suffix}`, description: "Legacy property", address: "Pantai Selatan", images: { create: { url: "https://example.com/beach.jpg", sortOrder: 0 } } },
      select: { id: true },
    });
    tracker.propertyIds.push(property.id);

    const room = await prisma.roomType.create({
      data: { propertyId: property.id, name: `Room Legacy ${suffix}`, description: "Legacy room", basePrice: "350000", totalUnits: 2, maxGuests: 3 },
      select: { id: true },
    });

    await prisma.roomTypeCalendar.create({ data: { roomTypeId: room.id, date: toDate("2026-05-01"), availableUnits: 2, price: "300000", isClosed: false } });

    const result = await service.listPublicProperties({ start_date: "2026-05-01", end_date: "2026-05-03", city_id: city.id.toString() });
    assert.equal(result.meta.total, 1);
    assert.equal(result.data[0]?.name, `IT Legacy Beach ${suffix}`);
    assert.equal(result.data[0]?.minPrice, "300000");
  } finally {
    await cleanupTracker(tracker);
  }
});

test("[integration] listPublicProperties menolak nights tanpa start_date", async () => {
  await assert.rejects(
    async () => {
      await service.listPublicProperties({ nights: "2" });
    },
    (error) => error instanceof Error && error.message.includes("Tanggal mulai wajib diisi"),
  );
});
