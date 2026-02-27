import crypto from "node:crypto";
import { AccountType } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { PropertyService } from "./property.service.js";

export type CleanupTracker = {
  accountId: string | null;
  cityIds: bigint[];
  categoryIds: bigint[];
  propertyIds: string[];
};

export const service = new PropertyService(prisma);

export const toDate = (value: string) => new Date(`${value}T00:00:00.000Z`);

export const uniqueSuffix = () =>
  `${Date.now()}_${crypto.randomUUID().slice(0, 8).toLowerCase()}`;

export const createTracker = (): CleanupTracker => ({
  accountId: null,
  cityIds: [],
  categoryIds: [],
  propertyIds: [],
});

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
  await deleteStringIds(tracker.propertyIds, (ids) =>
    prisma.property.deleteMany({ where: { id: { in: ids } } }),
  );
  await deleteBigIntIds(tracker.categoryIds, (ids) =>
    prisma.propertyCategory.deleteMany({ where: { id: { in: ids } } }),
  );
  await deleteBigIntIds(tracker.cityIds, (ids) =>
    prisma.city.deleteMany({ where: { id: { in: ids } } }),
  );
  if (tracker.accountId) {
    await prisma.account.deleteMany({ where: { id: tracker.accountId } });
  }
};

export const createTenant = async (suffix: string) => {
  const tenant = await prisma.account.create({
    data: {
      email: `it_property_${suffix}@example.com`,
      type: AccountType.TENANT,
      isVerified: true,
    },
    select: { id: true },
  });
  return tenant.id;
};
