import { PrismaClient } from "@prisma/client";
import { ApiError } from "../../utils/api-error.js";
import {
  CategoryResult,
  CityResult,
  ListMeta,
  ListOptions,
} from "./catalog.types.js";
import {
  buildListMeta,
  toCategoryResult,
  toCityResult,
} from "./catalog.utils.js";

export class CatalogService {
  constructor(private prisma: PrismaClient) {}

  listCities = async (
    search: string,
    options: ListOptions,
  ): Promise<{ data: CityResult[]; meta: ListMeta }> => {
    const where = search
      ? { name: { contains: search, mode: "insensitive" as const } }
      : undefined;
    const skip = (options.page - 1) * options.limit;

    const [cities, total] = await this.prisma.$transaction([
      this.prisma.city.findMany({
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
      this.prisma.city.count({ where }),
    ]);

    const data = cities.map(toCityResult);

    return {
      data,
      meta: buildListMeta(options.page, options.limit, total),
    };
  };

  listCategories = async (
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

    const [categories, total] = await this.prisma.$transaction([
      this.prisma.propertyCategory.findMany({
        where,
        orderBy: { name: options.sortOrder },
        skip,
        take: options.limit,
        select: {
          id: true,
          name: true,
        },
      }),
      this.prisma.propertyCategory.count({ where }),
    ]);

    const data = categories.map(toCategoryResult);

    return {
      data,
      meta: buildListMeta(options.page, options.limit, total),
    };
  };

  createCategory = async (
    tenantAccountId: string,
    name: string,
  ): Promise<CategoryResult> => {
    const trimmedName = name.trim();
    const existingCategory = await this.prisma.propertyCategory.findFirst({
      where: {
        tenantAccountId,
        name: { equals: trimmedName, mode: "insensitive" },
      },
      select: { id: true, name: true },
    });

    if (existingCategory) {
      return toCategoryResult(existingCategory);
    }

    const created = await this.prisma.propertyCategory.create({
      data: {
        tenantAccountId,
        name: trimmedName,
      },
      select: { id: true, name: true },
    });

    return toCategoryResult(created);
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

    return toCategoryResult(updated);
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
