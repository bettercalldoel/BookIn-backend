import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import {
  AccountType,
  OrderStatus,
  PaymentMethod,
  PaymentProofStatus,
} from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { BookingService } from "./booking.service.js";

type CleanupTracker = {
  bookingIds: string[];
  roomTypeIds: string[];
  propertyIds: string[];
  categoryIds: bigint[];
  cityIds: bigint[];
  accountIds: string[];
};

type SalesFixture = {
  tenantId: string;
  propertyAName: string;
  propertyBName: string;
  userOneName: string;
  userTwoName: string;
  orderNos: {
    a: string;
    c: string;
    d: string;
    f: string;
  };
};

const service = new BookingService(prisma);

const toDate = (value: string) => new Date(`${value}T00:00:00.000Z`);

const toDateTime = (value: string) => new Date(`${value}.000Z`);

const createTracker = (): CleanupTracker => ({
  bookingIds: [],
  roomTypeIds: [],
  propertyIds: [],
  categoryIds: [],
  cityIds: [],
  accountIds: [],
});

const uniqueSuffix = () =>
  `${Date.now()}_${crypto.randomUUID().slice(0, 8).toLowerCase()}`;

const cleanupTracker = async (tracker: CleanupTracker) => {
  if (tracker.bookingIds.length > 0) {
    await prisma.booking.deleteMany({
      where: { id: { in: tracker.bookingIds } },
    });
  }

  if (tracker.roomTypeIds.length > 0) {
    await prisma.roomType.deleteMany({
      where: { id: { in: tracker.roomTypeIds } },
    });
  }

  if (tracker.propertyIds.length > 0) {
    await prisma.property.deleteMany({
      where: { id: { in: tracker.propertyIds } },
    });
  }

  if (tracker.categoryIds.length > 0) {
    await prisma.propertyCategory.deleteMany({
      where: { id: { in: tracker.categoryIds } },
    });
  }

  if (tracker.cityIds.length > 0) {
    await prisma.city.deleteMany({
      where: { id: { in: tracker.cityIds } },
    });
  }

  if (tracker.accountIds.length > 0) {
    await prisma.account.deleteMany({
      where: { id: { in: tracker.accountIds } },
    });
  }
};

const seedSalesFixture = async (
  tracker: CleanupTracker,
): Promise<SalesFixture> => {
  const suffix = uniqueSuffix();

  const tenant = await prisma.account.create({
    data: {
      email: `it_sales_tenant_${suffix}@example.com`,
      type: AccountType.TENANT,
      isVerified: true,
    },
    select: { id: true },
  });
  tracker.accountIds.push(tenant.id);

  const userOneName = `IT User One ${suffix}`;
  const userTwoName = `IT User Two ${suffix}`;

  const userOne = await prisma.account.create({
    data: {
      email: `it_sales_user_one_${suffix}@example.com`,
      type: AccountType.USER,
      isVerified: true,
      userProfile: {
        create: {
          fullName: userOneName,
        },
      },
    },
    select: { id: true },
  });
  tracker.accountIds.push(userOne.id);

  const userTwo = await prisma.account.create({
    data: {
      email: `it_sales_user_two_${suffix}@example.com`,
      type: AccountType.USER,
      isVerified: true,
      userProfile: {
        create: {
          fullName: userTwoName,
        },
      },
    },
    select: { id: true },
  });
  tracker.accountIds.push(userTwo.id);

  const city = await prisma.city.create({
    data: {
      name: `IT Sales City ${suffix}`,
      provinceName: "DKI Jakarta",
      country: "Indonesia",
    },
    select: { id: true },
  });
  tracker.cityIds.push(city.id);

  const category = await prisma.propertyCategory.create({
    data: {
      tenantAccountId: tenant.id,
      name: `IT Sales Category ${suffix}`,
    },
    select: { id: true },
  });
  tracker.categoryIds.push(category.id);

  const propertyAName = `IT Sales Property A ${suffix}`;
  const propertyBName = `IT Sales Property B ${suffix}`;

  const propertyA = await prisma.property.create({
    data: {
      tenantAccountId: tenant.id,
      categoryId: category.id,
      cityId: city.id,
      name: propertyAName,
      description: "Property A for integration test",
      address: "Jl. A",
    },
    select: { id: true },
  });
  tracker.propertyIds.push(propertyA.id);

  const propertyB = await prisma.property.create({
    data: {
      tenantAccountId: tenant.id,
      categoryId: category.id,
      cityId: city.id,
      name: propertyBName,
      description: "Property B for integration test",
      address: "Jl. B",
    },
    select: { id: true },
  });
  tracker.propertyIds.push(propertyB.id);

  const roomA = await prisma.roomType.create({
    data: {
      propertyId: propertyA.id,
      name: `Room A ${suffix}`,
      description: "Room A",
      basePrice: "500000",
      totalUnits: 5,
      maxGuests: 2,
    },
    select: { id: true },
  });
  tracker.roomTypeIds.push(roomA.id);

  const roomB = await prisma.roomType.create({
    data: {
      propertyId: propertyB.id,
      name: `Room B ${suffix}`,
      description: "Room B",
      basePrice: "700000",
      totalUnits: 5,
      maxGuests: 2,
    },
    select: { id: true },
  });
  tracker.roomTypeIds.push(roomB.id);

  const createBooking = async (payload: {
    orderNo: string;
    userId: string;
    propertyId: string;
    roomTypeId: string;
    paymentMethod: PaymentMethod;
    status: OrderStatus;
    totalAmount: string;
    createdAt: Date;
    paymentConfirmedAt: Date | null;
    xenditInvoiceStatus?: string | null;
  }) => {
    const booking = await prisma.booking.create({
      data: {
        orderNo: payload.orderNo,
        userId: payload.userId,
        tenantId: tenant.id,
        propertyId: payload.propertyId,
        roomTypeId: payload.roomTypeId,
        checkIn: toDate("2026-01-20"),
        checkOut: toDate("2026-01-22"),
        guests: 2,
        rooms: 1,
        baseTotal: payload.totalAmount,
        adjustmentTotal: "0",
        totalAmount: payload.totalAmount,
        paymentMethod: payload.paymentMethod,
        status: payload.status,
        paymentDueAt: new Date(payload.createdAt.getTime() + 60 * 60 * 1000),
        paymentConfirmedAt: payload.paymentConfirmedAt,
        xenditInvoiceStatus: payload.xenditInvoiceStatus ?? null,
        createdAt: payload.createdAt,
        updatedAt: payload.createdAt,
      },
      select: { id: true },
    });
    tracker.bookingIds.push(booking.id);
    return booking.id;
  };

  const orderNos = {
    a: `IT-SALES-A-${suffix}`,
    c: `IT-SALES-C-${suffix}`,
    d: `IT-SALES-D-${suffix}`,
    f: `IT-SALES-F-${suffix}`,
  };

  const bookingAId = await createBooking({
    orderNo: orderNos.a,
    userId: userOne.id,
    propertyId: propertyA.id,
    roomTypeId: roomA.id,
    paymentMethod: PaymentMethod.MANUAL_TRANSFER,
    status: OrderStatus.DIPROSES,
    totalAmount: "500000",
    createdAt: toDateTime("2026-01-05T10:00:00"),
    paymentConfirmedAt: toDateTime("2026-01-05T12:00:00"),
  });

  const bookingBId = await createBooking({
    orderNo: `IT-SALES-B-${suffix}`,
    userId: userOne.id,
    propertyId: propertyA.id,
    roomTypeId: roomA.id,
    paymentMethod: PaymentMethod.MANUAL_TRANSFER,
    status: OrderStatus.MENUNGGU_KONFIRMASI_PEMBAYARAN,
    totalAmount: "450000",
    createdAt: toDateTime("2026-01-06T10:00:00"),
    paymentConfirmedAt: null,
  });

  const bookingCId = await createBooking({
    orderNo: orderNos.c,
    userId: userTwo.id,
    propertyId: propertyA.id,
    roomTypeId: roomA.id,
    paymentMethod: PaymentMethod.MANUAL_TRANSFER,
    status: OrderStatus.DIBATALKAN,
    totalAmount: "400000",
    createdAt: toDateTime("2026-01-07T10:00:00"),
    paymentConfirmedAt: toDateTime("2026-01-07T11:00:00"),
  });

  await createBooking({
    orderNo: `IT-SALES-E-${suffix}`,
    userId: userOne.id,
    propertyId: propertyB.id,
    roomTypeId: roomB.id,
    paymentMethod: PaymentMethod.XENDIT,
    status: OrderStatus.MENUNGGU_PEMBAYARAN,
    totalAmount: "300000",
    createdAt: toDateTime("2026-01-11T10:00:00"),
    paymentConfirmedAt: null,
    xenditInvoiceStatus: "PENDING",
  });

  await createBooking({
    orderNo: orderNos.d,
    userId: userTwo.id,
    propertyId: propertyB.id,
    roomTypeId: roomB.id,
    paymentMethod: PaymentMethod.XENDIT,
    status: OrderStatus.SELESAI,
    totalAmount: "700000",
    createdAt: toDateTime("2026-01-10T10:00:00"),
    paymentConfirmedAt: toDateTime("2026-01-10T11:00:00"),
    xenditInvoiceStatus: "SETTLED",
  });

  const bookingFId = await createBooking({
    orderNo: orderNos.f,
    userId: userOne.id,
    propertyId: propertyA.id,
    roomTypeId: roomA.id,
    paymentMethod: PaymentMethod.MANUAL_TRANSFER,
    status: OrderStatus.DIPROSES,
    totalAmount: "600000",
    createdAt: toDateTime("2026-01-12T10:00:00"),
    paymentConfirmedAt: toDateTime("2026-01-12T11:00:00"),
  });

  await prisma.paymentProof.createMany({
    data: [
      {
        bookingId: bookingAId,
        method: PaymentMethod.MANUAL_TRANSFER,
        status: PaymentProofStatus.APPROVED,
        imageUrl: "https://example.com/proof-a.jpg",
        submittedAt: toDateTime("2026-01-05T10:30:00"),
        reviewedAt: toDateTime("2026-01-05T12:00:00"),
      },
      {
        bookingId: bookingBId,
        method: PaymentMethod.MANUAL_TRANSFER,
        status: PaymentProofStatus.SUBMITTED,
        imageUrl: "https://example.com/proof-b.jpg",
        submittedAt: toDateTime("2026-01-06T10:30:00"),
      },
      {
        bookingId: bookingCId,
        method: PaymentMethod.MANUAL_TRANSFER,
        status: PaymentProofStatus.APPROVED,
        imageUrl: "https://example.com/proof-c.jpg",
        submittedAt: toDateTime("2026-01-07T10:30:00"),
        reviewedAt: toDateTime("2026-01-07T11:00:00"),
      },
      {
        bookingId: bookingFId,
        method: PaymentMethod.MANUAL_TRANSFER,
        status: PaymentProofStatus.APPROVED,
        imageUrl: "https://example.com/proof-f.jpg",
        submittedAt: toDateTime("2026-01-12T10:30:00"),
        reviewedAt: toDateTime("2026-01-12T11:00:00"),
      },
    ],
  });

  return {
    tenantId: tenant.id,
    propertyAName,
    propertyBName,
    userOneName,
    userTwoName,
    orderNos,
  };
};

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for integration tests.");
}

test("[integration] listTenantSalesReport view transaction memfilter paid booking + pagination", async () => {
  const tracker = createTracker();

  try {
    const fixture = await seedSalesFixture(tracker);
    const result = await service.listTenantSalesReport(fixture.tenantId, {
      view: "transaction",
      sortBy: "date",
      sortOrder: "desc",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      page: 1,
      limit: 2,
    });

    const rows = result.data as Array<{ orderNo: string; total: number }>;

    assert.equal(rows.length, 2);
    assert.equal(rows[0]?.orderNo, fixture.orderNos.f);
    assert.equal(rows[1]?.orderNo, fixture.orderNos.d);

    assert.equal(result.meta.total, 4);
    assert.equal(result.meta.totalPages, 2);
    assert.equal(result.meta.hasNext, true);
    assert.equal(result.meta.hasPrev, false);

    assert.equal(result.summary.totalSales, 1800000);
    assert.equal(result.summary.totalTransactions, 4);
    assert.equal(result.summary.avgPerTransaction, 450000);
    assert.equal(result.trend.length, 7);
    assert.equal(
      result.trend.reduce((sum, row) => sum + row.bookings, 0),
      4,
    );
    assert.equal(rows[0]?.total, 600000);
  } finally {
    await cleanupTracker(tracker);
  }
});

test("[integration] listTenantSalesReport view property agregasi total/users/transaksi valid", async () => {
  const tracker = createTracker();

  try {
    const fixture = await seedSalesFixture(tracker);
    const result = await service.listTenantSalesReport(fixture.tenantId, {
      view: "property",
      sortBy: "total",
      sortOrder: "desc",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      page: 1,
      limit: 10,
    });

    const rows = result.data as Array<{
      propertyName: string;
      transactions: number;
      users: number;
      totalSales: number;
    }>;

    assert.equal(rows.length, 2);
    assert.equal(rows[0]?.propertyName, fixture.propertyAName);
    assert.equal(rows[0]?.transactions, 3);
    assert.equal(rows[0]?.users, 2);
    assert.equal(rows[0]?.totalSales, 1100000);

    assert.equal(rows[1]?.propertyName, fixture.propertyBName);
    assert.equal(rows[1]?.transactions, 1);
    assert.equal(rows[1]?.users, 1);
    assert.equal(rows[1]?.totalSales, 700000);
    assert.equal(result.meta.total, 2);
  } finally {
    await cleanupTracker(tracker);
  }
});

test("[integration] listTenantSalesReport view user sort date menampilkan urutan stabil", async () => {
  const tracker = createTracker();

  try {
    const fixture = await seedSalesFixture(tracker);
    const result = await service.listTenantSalesReport(fixture.tenantId, {
      view: "user",
      sortBy: "date",
      sortOrder: "desc",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      page: 1,
      limit: 10,
    });

    const rows = result.data as Array<{
      userName: string;
      transactions: number;
      properties: number;
      totalSales: number;
    }>;

    assert.equal(rows.length, 2);
    assert.equal(rows[0]?.userName, fixture.userOneName);
    assert.equal(rows[0]?.transactions, 2);
    assert.equal(rows[0]?.properties, 1);
    assert.equal(rows[0]?.totalSales, 1100000);

    assert.equal(rows[1]?.userName, fixture.userTwoName);
    assert.equal(rows[1]?.transactions, 2);
    assert.equal(rows[1]?.properties, 2);
    assert.equal(rows[1]?.totalSales, 700000);
  } finally {
    await cleanupTracker(tracker);
  }
});

test("[integration] listTenantSalesReport menolak date range tidak valid", async () => {
  const tracker = createTracker();

  try {
    const fixture = await seedSalesFixture(tracker);
    await assert.rejects(
      async () => {
        await service.listTenantSalesReport(fixture.tenantId, {
          view: "transaction",
          sortBy: "date",
          sortOrder: "desc",
          startDate: "2026-01-31",
          endDate: "2026-01-01",
          page: 1,
          limit: 10,
        });
      },
      (error) =>
        error instanceof Error &&
        error.message.includes("Tanggal akhir harus setelah tanggal mulai."),
    );
  } finally {
    await cleanupTracker(tracker);
  }
});

test.after(async () => {
  await prisma.$disconnect();
});
