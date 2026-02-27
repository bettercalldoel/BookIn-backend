import {
  AccountType,
  OrderStatus,
  PaymentMethod,
  PaymentProofStatus,
} from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import type {
  CleanupTracker,
  SalesFixture,
} from "./booking.service.integration.helpers.js";
import { toDate, toDateTime, uniqueSuffix } from "./booking.service.integration.helpers.js";

const createBooking = async (
  tracker: CleanupTracker,
  tenantId: string,
  payload: {
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
  },
) => {
  const booking = await prisma.booking.create({
    data: {
      orderNo: payload.orderNo, userId: payload.userId, tenantId, propertyId: payload.propertyId, roomTypeId: payload.roomTypeId, checkIn: toDate("2026-01-20"), checkOut: toDate("2026-01-22"), guests: 2, rooms: 1, baseTotal: payload.totalAmount, adjustmentTotal: "0", totalAmount: payload.totalAmount, paymentMethod: payload.paymentMethod, status: payload.status, paymentDueAt: new Date(payload.createdAt.getTime() + 60 * 60 * 1000), paymentConfirmedAt: payload.paymentConfirmedAt, xenditInvoiceStatus: payload.xenditInvoiceStatus ?? null, createdAt: payload.createdAt, updatedAt: payload.createdAt,
    },
    select: { id: true },
  });
  tracker.bookingIds.push(booking.id);
  return booking.id;
};

export const seedSalesFixture = async (tracker: CleanupTracker): Promise<SalesFixture> => {
  const suffix = uniqueSuffix();
  const userOneName = `IT User One ${suffix}`;
  const userTwoName = `IT User Two ${suffix}`;
  const propertyAName = `IT Sales Property A ${suffix}`;
  const propertyBName = `IT Sales Property B ${suffix}`;

  const tenant = await prisma.account.create({ data: { email: `it_sales_tenant_${suffix}@example.com`, type: AccountType.TENANT, isVerified: true }, select: { id: true } });
  const userOne = await prisma.account.create({ data: { email: `it_sales_user_one_${suffix}@example.com`, type: AccountType.USER, isVerified: true, userProfile: { create: { fullName: userOneName } } }, select: { id: true } });
  const userTwo = await prisma.account.create({ data: { email: `it_sales_user_two_${suffix}@example.com`, type: AccountType.USER, isVerified: true, userProfile: { create: { fullName: userTwoName } } }, select: { id: true } });
  tracker.accountIds.push(tenant.id, userOne.id, userTwo.id);

  const city = await prisma.city.create({ data: { name: `IT Sales City ${suffix}`, provinceName: "DKI Jakarta", country: "Indonesia" }, select: { id: true } });
  const category = await prisma.propertyCategory.create({ data: { tenantAccountId: tenant.id, name: `IT Sales Category ${suffix}` }, select: { id: true } });
  tracker.cityIds.push(city.id); tracker.categoryIds.push(category.id);

  const propertyA = await prisma.property.create({ data: { tenantAccountId: tenant.id, categoryId: category.id, cityId: city.id, name: propertyAName, description: "Property A for integration test", address: "Jl. A" }, select: { id: true } });
  const propertyB = await prisma.property.create({ data: { tenantAccountId: tenant.id, categoryId: category.id, cityId: city.id, name: propertyBName, description: "Property B for integration test", address: "Jl. B" }, select: { id: true } });
  tracker.propertyIds.push(propertyA.id, propertyB.id);

  const roomA = await prisma.roomType.create({ data: { propertyId: propertyA.id, name: `Room A ${suffix}`, description: "Room A", basePrice: "500000", totalUnits: 5, maxGuests: 2 }, select: { id: true } });
  const roomB = await prisma.roomType.create({ data: { propertyId: propertyB.id, name: `Room B ${suffix}`, description: "Room B", basePrice: "700000", totalUnits: 5, maxGuests: 2 }, select: { id: true } });
  tracker.roomTypeIds.push(roomA.id, roomB.id);

  const orderNos = { a: `IT-SALES-A-${suffix}`, c: `IT-SALES-C-${suffix}`, d: `IT-SALES-D-${suffix}`, f: `IT-SALES-F-${suffix}` };
  const bookingAId = await createBooking(tracker, tenant.id, { orderNo: orderNos.a, userId: userOne.id, propertyId: propertyA.id, roomTypeId: roomA.id, paymentMethod: PaymentMethod.MANUAL_TRANSFER, status: OrderStatus.DIPROSES, totalAmount: "500000", createdAt: toDateTime("2026-01-05T10:00:00"), paymentConfirmedAt: toDateTime("2026-01-05T12:00:00") });
  const bookingBId = await createBooking(tracker, tenant.id, { orderNo: `IT-SALES-B-${suffix}`, userId: userOne.id, propertyId: propertyA.id, roomTypeId: roomA.id, paymentMethod: PaymentMethod.MANUAL_TRANSFER, status: OrderStatus.MENUNGGU_KONFIRMASI_PEMBAYARAN, totalAmount: "450000", createdAt: toDateTime("2026-01-06T10:00:00"), paymentConfirmedAt: null });
  const bookingCId = await createBooking(tracker, tenant.id, { orderNo: orderNos.c, userId: userTwo.id, propertyId: propertyA.id, roomTypeId: roomA.id, paymentMethod: PaymentMethod.MANUAL_TRANSFER, status: OrderStatus.DIBATALKAN, totalAmount: "400000", createdAt: toDateTime("2026-01-07T10:00:00"), paymentConfirmedAt: toDateTime("2026-01-07T11:00:00") });
  await createBooking(tracker, tenant.id, { orderNo: `IT-SALES-E-${suffix}`, userId: userOne.id, propertyId: propertyB.id, roomTypeId: roomB.id, paymentMethod: PaymentMethod.XENDIT, status: OrderStatus.MENUNGGU_PEMBAYARAN, totalAmount: "300000", createdAt: toDateTime("2026-01-11T10:00:00"), paymentConfirmedAt: null, xenditInvoiceStatus: "PENDING" });
  await createBooking(tracker, tenant.id, { orderNo: orderNos.d, userId: userTwo.id, propertyId: propertyB.id, roomTypeId: roomB.id, paymentMethod: PaymentMethod.XENDIT, status: OrderStatus.SELESAI, totalAmount: "700000", createdAt: toDateTime("2026-01-10T10:00:00"), paymentConfirmedAt: toDateTime("2026-01-10T11:00:00"), xenditInvoiceStatus: "SETTLED" });
  const bookingFId = await createBooking(tracker, tenant.id, { orderNo: orderNos.f, userId: userOne.id, propertyId: propertyA.id, roomTypeId: roomA.id, paymentMethod: PaymentMethod.MANUAL_TRANSFER, status: OrderStatus.DIPROSES, totalAmount: "600000", createdAt: toDateTime("2026-01-12T10:00:00"), paymentConfirmedAt: toDateTime("2026-01-12T11:00:00") });

  await prisma.paymentProof.createMany({
    data: [
      { bookingId: bookingAId, method: PaymentMethod.MANUAL_TRANSFER, status: PaymentProofStatus.APPROVED, imageUrl: "https://example.com/proof-a.jpg", submittedAt: toDateTime("2026-01-05T10:30:00"), reviewedAt: toDateTime("2026-01-05T12:00:00") },
      { bookingId: bookingBId, method: PaymentMethod.MANUAL_TRANSFER, status: PaymentProofStatus.SUBMITTED, imageUrl: "https://example.com/proof-b.jpg", submittedAt: toDateTime("2026-01-06T10:30:00") },
      { bookingId: bookingCId, method: PaymentMethod.MANUAL_TRANSFER, status: PaymentProofStatus.APPROVED, imageUrl: "https://example.com/proof-c.jpg", submittedAt: toDateTime("2026-01-07T10:30:00"), reviewedAt: toDateTime("2026-01-07T11:00:00") },
      { bookingId: bookingFId, method: PaymentMethod.MANUAL_TRANSFER, status: PaymentProofStatus.APPROVED, imageUrl: "https://example.com/proof-f.jpg", submittedAt: toDateTime("2026-01-12T10:30:00"), reviewedAt: toDateTime("2026-01-12T11:00:00") },
    ],
  });

  return { tenantId: tenant.id, propertyAName, propertyBName, userOneName, userTwoName, orderNos };
};
