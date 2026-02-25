import { PrismaClient } from "@prisma/client";

export type CityResult = {
  id: string;
  name: string;
  province?: string | null;
};

export type CategoryResult = {
  id: string;
  name: string;
};

export type ListOptions = {
  page: number;
  limit: number;
  sortOrder: "asc" | "desc";
};

export type ListMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
};

export const listCatalogCities = async (
  prisma: PrismaClient,
  search: string,
  options: ListOptions,
): Promise<{ data: CityResult[]; meta: ListMeta }> => {
  const where = search
    ? { name: { contains: search, mode: "insensitive" as const } }
    : undefined;
  const skip = (options.page - 1) * options.limit;

  const [cities, total] = await prisma.$transaction([
    prisma.city.findMany({
      where,
      orderBy: { name: options.sortOrder },
      skip,
      take: options.limit,
      select: {
        id: true,
        name: true,
        provinceName: true,
      },
    }),
    prisma.city.count({ where }),
  ]);

  const data = cities.map((city) => ({
    id: city.id.toString(),
    name: city.name,
    province: city.provinceName,
  }));
  const totalPages = Math.max(1, Math.ceil(total / options.limit));

  return {
    data,
    meta: {
      page: options.page,
      limit: options.limit,
      total,
      totalPages,
      hasNext: options.page < totalPages,
      hasPrev: options.page > 1,
    },
  };
};

export const listCatalogCategories = async (
  prisma: PrismaClient,
  tenantAccountId: string,
  search: string,
  options: ListOptions,
): Promise<{ data: CategoryResult[]; meta: ListMeta }> => {
  const where = {
    tenantAccountId,
    isActive: true,
    ...(search
      ? { name: { contains: search, mode: "insensitive" as const } }
      : {}),
  };
  const skip = (options.page - 1) * options.limit;

  const [categories, total] = await prisma.$transaction([
    prisma.propertyCategory.findMany({
      where,
      orderBy: { name: options.sortOrder },
      skip,
      take: options.limit,
      select: {
        id: true,
        name: true,
      },
    }),
    prisma.propertyCategory.count({ where }),
  ]);

  const data = categories.map((category) => ({
    id: category.id.toString(),
    name: category.name,
  }));
  const totalPages = Math.max(1, Math.ceil(total / options.limit));

  return {
    data,
    meta: {
      page: options.page,
      limit: options.limit,
      total,
      totalPages,
      hasNext: options.page < totalPages,
      hasPrev: options.page > 1,
    },
  };
};
