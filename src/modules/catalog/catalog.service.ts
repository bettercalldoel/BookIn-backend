import { PrismaClient } from "@prisma/client";
import { ApiError } from "../../utils/api-error.js";

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

  updateCategory = async (
    tenantAccountId: string,
    categoryIdRaw: string,
    name: string,
  ): Promise<CategoryResult> => {
    const categoryId = this.parseCategoryId(categoryIdRaw);
    const trimmedName = name.trim();

    const existing = await this.prisma.propertyCategory.findFirst({
      where: {
        id: categoryId,
        tenantAccountId,
        isActive: true,
      },
      select: { id: true },
    });

    if (!existing) {
      throw new ApiError("Kategori tidak ditemukan.", 404);
    }

    const duplicate = await this.prisma.propertyCategory.findFirst({
      where: {
        tenantAccountId,
        isActive: true,
        id: { not: categoryId },
        name: { equals: trimmedName, mode: "insensitive" },
      },
      select: { id: true },
    });

    if (duplicate) {
      throw new ApiError("Nama kategori sudah digunakan.", 409);
    }

    const updated = await this.prisma.propertyCategory.update({
      where: { id: categoryId },
      data: { name: trimmedName },
      select: { id: true, name: true },
    });

    return {
      id: updated.id.toString(),
      name: updated.name,
    };
  };

  deleteCategory = async (
    tenantAccountId: string,
    categoryIdRaw: string,
  ): Promise<{ message: string; id: string }> => {
    const categoryId = this.parseCategoryId(categoryIdRaw);

    const existing = await this.prisma.propertyCategory.findFirst({
      where: {
        id: categoryId,
        tenantAccountId,
        isActive: true,
      },
      select: { id: true },
    });

    if (!existing) {
      throw new ApiError("Kategori tidak ditemukan.", 404);
    }

    await this.prisma.propertyCategory.update({
      where: { id: categoryId },
      data: { isActive: false },
      select: { id: true },
    });

    return {
      message: "Kategori berhasil dihapus.",
      id: categoryId.toString(),
    };
  };

  private parseCategoryId(categoryIdRaw: string) {
    try {
      return BigInt(categoryIdRaw);
    } catch {
      throw new ApiError("ID kategori tidak valid.", 400);
    }
  }
}
