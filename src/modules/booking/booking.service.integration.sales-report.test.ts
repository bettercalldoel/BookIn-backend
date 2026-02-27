import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "../../lib/prisma.js";
import {
  cleanupTracker,
  createTracker,
  service,
} from "./booking.service.integration.helpers.js";
import { seedSalesFixture } from "./booking.service.integration.fixture.js";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for integration tests.");
}

test("[integration] listTenantSalesReport view transaction memfilter paid booking + pagination", async () => {
  const tracker = createTracker();
  try {
    const fixture = await seedSalesFixture(tracker);
    const result = await service.listTenantSalesReport(fixture.tenantId, {
      view: "transaction", sortBy: "date", sortOrder: "desc", startDate: "2026-01-01", endDate: "2026-01-31", page: 1, limit: 2,
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
      result.trend.reduce(
        (sum: number, row: { bookings: number }) => sum + row.bookings,
        0,
      ),
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
      view: "property", sortBy: "total", sortOrder: "desc", startDate: "2026-01-01", endDate: "2026-01-31", page: 1, limit: 10,
    });
    const rows = result.data as Array<{ propertyName: string; transactions: number; users: number; totalSales: number }>;
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
      view: "user", sortBy: "date", sortOrder: "desc", startDate: "2026-01-01", endDate: "2026-01-31", page: 1, limit: 10,
    });
    const rows = result.data as Array<{ userName: string; transactions: number; properties: number; totalSales: number }>;
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
        await service.listTenantSalesReport(fixture.tenantId, { view: "transaction", sortBy: "date", sortOrder: "desc", startDate: "2026-01-31", endDate: "2026-01-01", page: 1, limit: 10 });
      },
      (error) => error instanceof Error && error.message.includes("Tanggal akhir harus setelah tanggal mulai."),
    );
  } finally {
    await cleanupTracker(tracker);
  }
});

test.after(async () => {
  await prisma.$disconnect();
});
