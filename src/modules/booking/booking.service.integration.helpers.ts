import crypto from "node:crypto";
import { prisma } from "../../lib/prisma.js";
import { BookingService } from "./booking.service.js";

export type CleanupTracker = {
  bookingIds: string[];
  roomTypeIds: string[];
  propertyIds: string[];
  categoryIds: bigint[];
  cityIds: bigint[];
  accountIds: string[];
};

export type SalesFixture = {
  tenantId: string;
  propertyAName: string;
  propertyBName: string;
  userOneName: string;
  userTwoName: string;
  orderNos: { a: string; c: string; d: string; f: string };
};

export const service = new BookingService(prisma);

export const toDate = (value: string) => new Date(`${value}T00:00:00.000Z`);

export const toDateTime = (value: string) => new Date(`${value}.000Z`);

export const createTracker = (): CleanupTracker => ({
  bookingIds: [],
  roomTypeIds: [],
  propertyIds: [],
  categoryIds: [],
  cityIds: [],
  accountIds: [],
});

export const uniqueSuffix = () =>
  `${Date.now()}_${crypto.randomUUID().slice(0, 8).toLowerCase()}`;

const deleteStringIds = async (
  ids: string[],
  action: (ids: string[]) => Promise<unknown>,
) => {
  if (ids.length === 0) return;
  await action(ids);
};

const deleteBigIntIds = async (
  ids: bigint[],
  action: (ids: bigint[]) => Promise<unknown>,
) => {
  if (ids.length === 0) return;
  await action(ids);
};

export const cleanupTracker = async (tracker: CleanupTracker) => {
  await deleteStringIds(tracker.bookingIds, (ids) =>
    prisma.booking.deleteMany({ where: { id: { in: ids } } }),
  );
  await deleteStringIds(tracker.roomTypeIds, (ids) =>
    prisma.roomType.deleteMany({ where: { id: { in: ids } } }),
  );
  await deleteStringIds(tracker.propertyIds, (ids) =>
    prisma.property.deleteMany({ where: { id: { in: ids } } }),
  );
  await deleteBigIntIds(tracker.categoryIds, (ids) =>
    prisma.propertyCategory.deleteMany({ where: { id: { in: ids } } }),
  );
  await deleteBigIntIds(tracker.cityIds, (ids) =>
    prisma.city.deleteMany({ where: { id: { in: ids } } }),
  );
  await deleteStringIds(tracker.accountIds, (ids) =>
    prisma.account.deleteMany({ where: { id: { in: ids } } }),
  );
};
