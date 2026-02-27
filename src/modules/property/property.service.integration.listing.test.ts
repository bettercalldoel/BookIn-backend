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

test("[integration] listPublicProperties memetakan hasil query DB + meta pagination", async () => {
  const tracker = createTracker();
  const suffix = uniqueSuffix();

  try {
    const tenantId = await createTenant(suffix);
    tracker.accountId = tenantId;

    const city = await prisma.city.create({
      data: { name: `IT City ${suffix}`, provinceName: "DI Yogyakarta", country: "Indonesia" },
      select: { id: true },
    });
    tracker.cityIds.push(city.id);

    const [villaCategory, hotelCategory] = await prisma.$transaction([
      prisma.propertyCategory.create({ data: { tenantAccountId: tenantId, name: `IT Villa ${suffix}` }, select: { id: true } }),
      prisma.propertyCategory.create({ data: { tenantAccountId: tenantId, name: `IT Hotel ${suffix}` }, select: { id: true } }),
    ]);
    tracker.categoryIds.push(villaCategory.id, hotelCategory.id);

    const merapi = await prisma.property.create({
      data: { tenantAccountId: tenantId, categoryId: villaCategory.id, cityId: city.id, name: `IT A Merapi ${suffix}`, description: "Integration test property A", address: "Jl. Merapi", images: { create: { url: "https://example.com/merapi.jpg", sortOrder: 0 } } },
      select: { id: true },
    });
    const bromo = await prisma.property.create({
      data: { tenantAccountId: tenantId, categoryId: hotelCategory.id, cityId: city.id, name: `IT B Bromo ${suffix}`, description: "Integration test property B", address: "Jl. Bromo", images: { create: { url: "https://example.com/bromo.jpg", sortOrder: 0 } } },
      select: { id: true },
    });
    const unavailable = await prisma.property.create({
      data: { tenantAccountId: tenantId, categoryId: hotelCategory.id, cityId: city.id, name: `IT C Unavailable ${suffix}`, description: "Integration test property C", address: "Jl. Sudirman", images: { create: { url: "https://example.com/unavailable.jpg", sortOrder: 0 } } },
      select: { id: true },
    });
    tracker.propertyIds.push(merapi.id, bromo.id, unavailable.id);

    const merapiRoom = await prisma.roomType.create({ data: { propertyId: merapi.id, name: `Room Merapi ${suffix}`, description: "Room Merapi", basePrice: "650000", totalUnits: 2, maxGuests: 2 }, select: { id: true } });
    const bromoRoom = await prisma.roomType.create({ data: { propertyId: bromo.id, name: `Room Bromo ${suffix}`, description: "Room Bromo", basePrice: "720000", totalUnits: 2, maxGuests: 2 }, select: { id: true } });
    const unavailableRoom = await prisma.roomType.create({ data: { propertyId: unavailable.id, name: `Room Unavailable ${suffix}`, description: "Room unavailable", basePrice: "200000", totalUnits: 2, maxGuests: 2 }, select: { id: true } });

    await prisma.roomTypeCalendar.createMany({
      data: [
        { roomTypeId: merapiRoom.id, date: toDate("2026-03-10"), availableUnits: 2, price: "600000", isClosed: false },
        { roomTypeId: merapiRoom.id, date: toDate("2026-03-11"), availableUnits: 2, price: "620000", isClosed: false },
        { roomTypeId: bromoRoom.id, date: toDate("2026-03-10"), availableUnits: 2, price: "700000", isClosed: false },
        { roomTypeId: bromoRoom.id, date: toDate("2026-03-11"), availableUnits: 2, price: "690000", isClosed: false },
        { roomTypeId: unavailableRoom.id, date: toDate("2026-03-10"), availableUnits: 0, price: "180000", isClosed: false },
        { roomTypeId: unavailableRoom.id, date: toDate("2026-03-11"), availableUnits: 2, price: "180000", isClosed: false },
      ],
    });

    const pageOne = await service.listPublicProperties({ city_id: city.id.toString(), start_date: "2026-03-10", nights: "2", sort_by: "price", sort_order: "asc", page: "1", limit: "1" });
    assert.equal(pageOne.meta.total, 2);
    assert.equal(pageOne.meta.totalPages, 2);
    assert.equal(pageOne.meta.hasNext, true);
    assert.equal(pageOne.meta.hasPrev, false);
    assert.deepEqual(pageOne.meta.categories, [{ name: `IT Hotel ${suffix}`, count: 1 }, { name: `IT Villa ${suffix}`, count: 1 }]);
    assert.equal(pageOne.data.length, 1);
    assert.equal(pageOne.data[0]?.name, `IT A Merapi ${suffix}`);
    assert.equal(pageOne.data[0]?.minPrice, "600000");

    const pageTwo = await service.listPublicProperties({ city_id: city.id.toString(), start_date: "2026-03-10", nights: "2", sort_by: "price", sort_order: "asc", page: "2", limit: "1" });
    assert.equal(pageTwo.data.length, 1);
    assert.equal(pageTwo.meta.hasNext, false);
    assert.equal(pageTwo.meta.hasPrev, true);
    assert.equal(pageTwo.data[0]?.name, `IT B Bromo ${suffix}`);
    assert.equal(pageTwo.data[0]?.minPrice, "690000");
  } finally {
    await cleanupTracker(tracker);
  }
});

test.after(async () => {
  await prisma.$disconnect();
});
