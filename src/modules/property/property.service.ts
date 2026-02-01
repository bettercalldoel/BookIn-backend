import { PrismaClient } from "@prisma/client";
import { ApiError } from "../../utils/api-error.js";
import { CreatePropertyDTO } from "./dto/create-property.dto.js";

const MAX_GALLERY_IMAGES = 5;

export class PropertyService {
  constructor(private prisma: PrismaClient) {}

  createProperty = async (tenantAccountId: string, body: CreatePropertyDTO) => {
    const name = body.name.trim();
    const description = body.description.trim();
    const address = body.address?.trim() || null;

    if (!body.galleryUrls.includes(body.coverUrl)) {
      throw new ApiError("Foto sampul harus dipilih dari galeri.", 400);
    }

    if (body.galleryUrls.length > MAX_GALLERY_IMAGES) {
      throw new ApiError(
        `Maksimal ${MAX_GALLERY_IMAGES} foto untuk galeri.`,
        400,
      );
    }

    let categoryId: bigint;
    try {
      categoryId = BigInt(body.categoryId);
    } catch {
      throw new ApiError("Kategori tidak valid.", 400);
    }

    const category = await this.prisma.propertyCategory.findFirst({
      where: {
        id: categoryId,
        tenantAccountId,
        isActive: true,
      },
    });

    if (!category) {
      throw new ApiError("Kategori tidak ditemukan.", 404);
    }

    let cityId: bigint;
    try {
      cityId = BigInt(body.cityId);
    } catch {
      throw new ApiError("Kota tidak valid.", 400);
    }
    const city = await this.prisma.city.findUnique({
      where: { id: cityId },
      select: { id: true },
    });

    if (!city) {
      throw new ApiError("Kota tidak ditemukan.", 404);
    }

    const orderedUrls = [
      body.coverUrl,
      ...body.galleryUrls.filter((url) => url !== body.coverUrl),
    ];
    const images = orderedUrls.map((url, index) => ({
      url,
      sortOrder: index,
    }));

    const property = await this.prisma.property.create({
      data: {
        tenantAccountId,
        categoryId,
        cityId,
        name,
        description,
        address,
        images: {
          create: images,
        },
      },
    });

    return {
      message: "Properti berhasil disimpan.",
      id: property.id,
    };
  };
}
