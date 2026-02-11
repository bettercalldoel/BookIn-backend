import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { PropertyService } from "./property.service.js";

const toDate = (value: string) => new Date(`${value}T00:00:00.000Z`);

const createService = (properties: unknown[]) => {
  const prisma = {
    property: {
      findMany: async () => properties,
    },
  } as unknown as PrismaClient;

  return new PropertyService(prisma);
};

test("listPublicProperties hanya menampilkan properti yang available dan hitung minPrice dari room tersedia", async () => {
  const service = createService([
    {
      id: "p-merapi",
      name: "Merapi Inn",
      address: "Jl. Merapi",
      category: { id: 1n, name: "Villa" },
      city: { name: "Sleman", provinceName: "DIY", province: { name: "DIY" } },
      images: [{ url: "https://example.com/merapi.jpg" }],
      roomTypes: [
        {
          id: "room-closed",
          basePrice: 300_000,
          totalUnits: 2,
          maxGuests: 2,
          calendar: [
            {
              date: toDate("2026-03-10"),
              availableUnits: 2,
              price: 250_000,
              isClosed: false,
            },
            {
              date: toDate("2026-03-11"),
              availableUnits: 2,
              price: 240_000,
              isClosed: true,
            },
          ],
        },
        {
          id: "room-open",
          basePrice: 650_000,
          totalUnits: 2,
          maxGuests: 2,
          calendar: [
            {
              date: toDate("2026-03-10"),
              availableUnits: 2,
              price: 600_000,
              isClosed: false,
            },
            {
              date: toDate("2026-03-11"),
              availableUnits: 2,
              price: 620_000,
              isClosed: false,
            },
          ],
        },
      ],
    },
    {
      id: "p-bromo",
      name: "Bromo Lodge",
      address: "Jl. Bromo",
      category: { id: 2n, name: "Hotel" },
      city: {
        name: "Malang",
        provinceName: "Jatim",
        province: { name: "Jatim" },
      },
      images: [{ url: "https://example.com/bromo.jpg" }],
      roomTypes: [
        {
          id: "room-bromo",
          basePrice: 720_000,
          totalUnits: 2,
          maxGuests: 2,
          calendar: [
            {
              date: toDate("2026-03-10"),
              availableUnits: 2,
              price: 700_000,
              isClosed: false,
            },
            {
              date: toDate("2026-03-11"),
              availableUnits: 2,
              price: 690_000,
              isClosed: false,
            },
          ],
        },
      ],
    },
    {
      id: "p-citypods",
      name: "City Pods",
      address: "Jl. Sudirman",
      category: { id: 3n, name: "Hostel" },
      city: {
        name: "Bandung",
        provinceName: "Jabar",
        province: { name: "Jabar" },
      },
      images: [{ url: "https://example.com/citypods.jpg" }],
      roomTypes: [
        {
          id: "room-unavailable",
          basePrice: 200_000,
          totalUnits: 2,
          maxGuests: 2,
          calendar: [
            {
              date: toDate("2026-03-10"),
              availableUnits: 0,
              price: 180_000,
              isClosed: false,
            },
            {
              date: toDate("2026-03-11"),
              availableUnits: 2,
              price: 180_000,
              isClosed: false,
            },
          ],
        },
      ],
    },
  ]);

  const result = await service.listPublicProperties({
    start_date: "2026-03-10",
    end_date: "2026-03-12",
    sort_by: "price",
    sort_order: "asc",
  });

  assert.equal(result.meta.total, 2);
  assert.deepEqual(
    result.data.map((item) => item.id),
    ["p-merapi", "p-bromo"],
  );
  assert.equal(result.data[0]?.minPrice, "600000");
  assert.equal(result.data[1]?.minPrice, "690000");
});

test("listPublicProperties fallback ke basePrice bila sebagian tanggal tidak punya calendar", async () => {
  const service = createService([
    {
      id: "p-beach",
      name: "Beach House",
      address: "Pantai Selatan",
      category: { id: 10n, name: "Resort" },
      city: {
        name: "Gunungkidul",
        provinceName: "DIY",
        province: { name: "DIY" },
      },
      images: [{ url: "https://example.com/beach.jpg" }],
      roomTypes: [
        {
          id: "room-beach",
          basePrice: 350_000,
          totalUnits: 2,
          maxGuests: 3,
          calendar: [
            {
              date: toDate("2026-05-01"),
              availableUnits: 2,
              price: 300_000,
              isClosed: false,
            },
          ],
        },
      ],
    },
  ]);

  const result = await service.listPublicProperties({
    start_date: "2026-05-01",
    end_date: "2026-05-03",
  });

  assert.equal(result.meta.total, 1);
  assert.equal(result.data[0]?.id, "p-beach");
  assert.equal(result.data[0]?.minPrice, "300000");
});
