import { PrismaClient } from "@prisma/client";

type CityResult = {
  id: string;
  name: string;
  province?: string | null;
};

type CategoryResult = {
  id: string;
  name: string;
};

export class CatalogService {
  constructor(private prisma: PrismaClient) {}

  listCities = async (search: string, limit: number): Promise<CityResult[]> => {
    const cities = await this.prisma.city.findMany({
      where: search
        ? { name: { contains: search, mode: "insensitive" } }
        : undefined,
      orderBy: { name: "asc" },
      take: limit,
      select: {
        id: true,
        name: true,
        provinceName: true,
      },
    });

    return cities.map((city) => ({
      id: city.id.toString(),
      name: city.name,
      province: city.provinceName,
    }));
  };

  listCategories = async (
    tenantAccountId: string,
    search: string,
    limit: number,
  ): Promise<CategoryResult[]> => {
    const categories = await this.prisma.propertyCategory.findMany({
      where: {
        tenantAccountId,
        isActive: true,
        ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
      },
      orderBy: { name: "asc" },
      take: limit,
      select: {
        id: true,
        name: true,
      },
    });

    return categories.map((category) => ({
      id: category.id.toString(),
      name: category.name,
    }));
  };

  createCategory = async (
    tenantAccountId: string,
    name: string,
  ): Promise<CategoryResult> => {
    const trimmedName = name.trim();
    const existing = await this.prisma.propertyCategory.findFirst({
      where: {
        tenantAccountId,
        name: { equals: trimmedName, mode: "insensitive" },
      },
      select: { id: true, name: true },
    });

    if (existing) {
      return {
        id: existing.id.toString(),
        name: existing.name,
      };
    }

    const created = await this.prisma.propertyCategory.create({
      data: {
        tenantAccountId,
        name: trimmedName,
      },
      select: { id: true, name: true },
    });

    return {
      id: created.id.toString(),
      name: created.name,
    };
  };
}
