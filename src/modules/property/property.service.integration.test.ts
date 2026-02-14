import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { AccountType } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { PropertyService } from "./property.service.js";

type CleanupTracker = {
  accountId: string | null;
  cityIds: bigint[];
  categoryIds: bigint[];
  propertyIds: string[];
};

const service = new PropertyService(prisma);

const toDate = (value: string) => new Date(`${value}T00:00:00.000Z`);

const uniqueSuffix = () =>
  `${Date.now()}_${crypto.randomUUID().slice(0, 8).toLowerCase()}`;

const createTracker = (): CleanupTracker => ({
  accountId: null,
  cityIds: [],
  categoryIds: [],
  propertyIds: [],
});

const cleanupTracker = async (tracker: CleanupTracker) => {
  if (tracker.propertyIds.length > 0) {
    await prisma.property.deleteMany({
      where: {
        id: { in: tracker.propertyIds },
      },
    });
  }

  if (tracker.categoryIds.length > 0) {
    await prisma.propertyCategory.deleteMany({
      where: {
        id: { in: tracker.categoryIds },
      },
    });
  }

  if (tracker.cityIds.length > 0) {
    await prisma.city.deleteMany({
      where: {
        id: { in: tracker.cityIds },
      },
    });
  }

  if (tracker.accountId) {
    await prisma.account.deleteMany({
      where: { id: tracker.accountId },
    });
  }
};

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for integration tests.");
}

test("[integration] listPublicProperties memetakan hasil query DB + meta pagination", async () => {
  const tracker = createTracker();
  const suffix = uniqueSuffix();

  try {
    const tenant = await prisma.account.create({
      data: {
        email: `it_property_${suffix}@example.com`,
        type: AccountType.TENANT,
        isVerified: true,
      },
      select: { id: true },
    });
    tracker.accountId = tenant.id;

    const city = await prisma.city.create({
      data: {
        name: `IT City ${suffix}`,
        provinceName: "DI Yogyakarta",
        country: "Indonesia",
      },
      select: { id: true },
    });
    tracker.cityIds.push(city.id);

    const [villaCategory, hotelCategory] = await prisma.$transaction([
      prisma.propertyCategory.create({
        data: {
          tenantAccountId: tenant.id,
          name: `IT Villa ${suffix}`,
        },
        select: { id: true },
      }),
      prisma.propertyCategory.create({
        data: {
          tenantAccountId: tenant.id,
          name: `IT Hotel ${suffix}`,
        },
        select: { id: true },
      }),
    ]);
    tracker.categoryIds.push(villaCategory.id, hotelCategory.id);

    const merapi = await prisma.property.create({
      data: {
        tenantAccountId: tenant.id,
        categoryId: villaCategory.id,
        cityId: city.id,
        name: `IT A Merapi ${suffix}`,
        description: "Integration test property A",
        address: "Jl. Merapi",
        images: {
          create: {
            url: "https://example.com/merapi.jpg",
            sortOrder: 0,
          },
        },
      },
      select: { id: true },
    });

    const bromo = await prisma.property.create({
      data: {
        tenantAccountId: tenant.id,
        categoryId: hotelCategory.id,
        cityId: city.id,
        name: `IT B Bromo ${suffix}`,
        description: "Integration test property B",
        address: "Jl. Bromo",
        images: {
          create: {
            url: "https://example.com/bromo.jpg",
            sortOrder: 0,
          },
        },
      },
      select: { id: true },
    });

    const unavailable = await prisma.property.create({
      data: {
        tenantAccountId: tenant.id,
        categoryId: hotelCategory.id,
        cityId: city.id,
        name: `IT C Unavailable ${suffix}`,
        description: "Integration test property C",
        address: "Jl. Sudirman",
        images: {
          create: {
            url: "https://example.com/unavailable.jpg",
            sortOrder: 0,
          },
        },
      },
      select: { id: true },
    });

    tracker.propertyIds.push(merapi.id, bromo.id, unavailable.id);

    const merapiRoom = await prisma.roomType.create({
      data: {
        propertyId: merapi.id,
        name: `Room Merapi ${suffix}`,
        description: "Room Merapi",
        basePrice: "650000",
        totalUnits: 2,
        maxGuests: 2,
      },
      select: { id: true },
    });

    const bromoRoom = await prisma.roomType.create({
      data: {
        propertyId: bromo.id,
        name: `Room Bromo ${suffix}`,
        description: "Room Bromo",
        basePrice: "720000",
        totalUnits: 2,
        maxGuests: 2,
      },
      select: { id: true },
    });

    const unavailableRoom = await prisma.roomType.create({
      data: {
        propertyId: unavailable.id,
        name: `Room Unavailable ${suffix}`,
        description: "Room unavailable",
        basePrice: "200000",
        totalUnits: 2,
        maxGuests: 2,
      },
      select: { id: true },
    });

    await prisma.roomTypeCalendar.createMany({
      data: [
        {
          roomTypeId: merapiRoom.id,
          date: toDate("2026-03-10"),
          availableUnits: 2,
          price: "600000",
          isClosed: false,
        },
        {
          roomTypeId: merapiRoom.id,
          date: toDate("2026-03-11"),
          availableUnits: 2,
          price: "620000",
          isClosed: false,
        },
        {
          roomTypeId: bromoRoom.id,
          date: toDate("2026-03-10"),
          availableUnits: 2,
          price: "700000",
          isClosed: false,
        },
        {
          roomTypeId: bromoRoom.id,
          date: toDate("2026-03-11"),
          availableUnits: 2,
          price: "690000",
          isClosed: false,
        },
        {
          roomTypeId: unavailableRoom.id,
          date: toDate("2026-03-10"),
          availableUnits: 0,
          price: "180000",
          isClosed: false,
        },
        {
          roomTypeId: unavailableRoom.id,
          date: toDate("2026-03-11"),
          availableUnits: 2,
          price: "180000",
          isClosed: false,
        },
      ],
    });

    const pageOne = await service.listPublicProperties({
      city_id: city.id.toString(),
      start_date: "2026-03-10",
      nights: "2",
      sort_by: "price",
      sort_order: "asc",
      page: "1",
      limit: "1",
    });

    assert.equal(pageOne.meta.total, 2);
    assert.equal(pageOne.meta.totalPages, 2);
    assert.equal(pageOne.meta.hasNext, true);
    assert.equal(pageOne.meta.hasPrev, false);
    assert.deepEqual(pageOne.meta.categories, [
      { name: `IT Hotel ${suffix}`, count: 1 },
      { name: `IT Villa ${suffix}`, count: 1 },
    ]);
    assert.equal(pageOne.data.length, 1);
    assert.equal(pageOne.data[0]?.name, `IT A Merapi ${suffix}`);
    assert.equal(pageOne.data[0]?.minPrice, "600000");

    const pageTwo = await service.listPublicProperties({
      city_id: city.id.toString(),
      start_date: "2026-03-10",
      nights: "2",
      sort_by: "price",
      sort_order: "asc",
      page: "2",
      limit: "1",
    });

    assert.equal(pageTwo.data.length, 1);
    assert.equal(pageTwo.meta.hasNext, false);
    assert.equal(pageTwo.meta.hasPrev, true);
    assert.equal(pageTwo.data[0]?.name, `IT B Bromo ${suffix}`);
    assert.equal(pageTwo.data[0]?.minPrice, "690000");
  } finally {
    await cleanupTracker(tracker);
  }
});

test("[integration] listPublicProperties kompatibel dengan start_date + end_date legacy", async () => {
  const tracker = createTracker();
  const suffix = uniqueSuffix();

  try {
    const tenant = await prisma.account.create({
      data: {
        email: `it_property_legacy_${suffix}@example.com`,
        type: AccountType.TENANT,
      },
      select: { id: true },
    });
    tracker.accountId = tenant.id;

    const city = await prisma.city.create({
      data: {
        name: `IT Legacy City ${suffix}`,
        provinceName: "DI Yogyakarta",
        country: "Indonesia",
      },
      select: { id: true },
    });
    tracker.cityIds.push(city.id);

    const category = await prisma.propertyCategory.create({
      data: {
        tenantAccountId: tenant.id,
        name: `IT Legacy Resort ${suffix}`,
      },
      select: { id: true },
    });
    tracker.categoryIds.push(category.id);

    const property = await prisma.property.create({
      data: {
        tenantAccountId: tenant.id,
        categoryId: category.id,
        cityId: city.id,
        name: `IT Legacy Beach ${suffix}`,
        description: "Legacy property",
        address: "Pantai Selatan",
        images: {
          create: {
            url: "https://example.com/beach.jpg",
            sortOrder: 0,
          },
        },
      },
      select: { id: true },
    });
    tracker.propertyIds.push(property.id);

    const room = await prisma.roomType.create({
      data: {
        propertyId: property.id,
        name: `Room Legacy ${suffix}`,
        description: "Legacy room",
        basePrice: "350000",
        totalUnits: 2,
        maxGuests: 3,
      },
      select: { id: true },
    });

    await prisma.roomTypeCalendar.create({
      data: {
        roomTypeId: room.id,
        date: toDate("2026-05-01"),
        availableUnits: 2,
        price: "300000",
        isClosed: false,
      },
    });

    const result = await service.listPublicProperties({
      start_date: "2026-05-01",
      end_date: "2026-05-03",
      city_id: city.id.toString(),
    });

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
    (error) =>
      error instanceof Error &&
      error.message.includes("Tanggal mulai wajib diisi"),
  );
});

test.after(async () => {
  await prisma.$disconnect();
});
