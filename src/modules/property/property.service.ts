import { PrismaClient } from "@prisma/client";
import { ApiError } from "../../utils/api-error.js";
import { CreatePropertyDTO } from "./dto/create-property.dto.js";
import { UpdatePropertyDTO } from "./dto/update-property.dto.js";
import { CreateRoomDTO } from "./dto/create-room.dto.js";
import { UpdateRoomDTO } from "./dto/update-room.dto.js";

const MAX_GALLERY_IMAGES = 5;

export class PropertyService {
  constructor(private prisma: PrismaClient) {}

  listProperties = async (tenantAccountId: string) => {
    const properties = await this.prisma.property.findMany({
      where: { tenantAccountId },
      include: {
        images: { orderBy: { sortOrder: "asc" } },
        category: { select: { id: true, name: true } },
        city: {
          select: {
            id: true,
            name: true,
            provinceName: true,
            province: { select: { name: true } },
          },
        },
        roomTypes: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return properties.map((property) => ({
      id: property.id,
      name: property.name,
      description: property.description,
      address: property.address,
      categoryId: property.categoryId.toString(),
      categoryName: property.category?.name ?? null,
      cityId: property.cityId.toString(),
      cityName: property.city?.name ?? null,
      province:
        property.city?.province?.name ?? property.city?.provinceName ?? null,
      coverUrl: property.images[0]?.url ?? null,
      galleryUrls: property.images.map((image) => image.url),
      rooms: property.roomTypes.map((room) => ({
        id: room.id,
        name: room.name,
        description: room.description,
        price: room.basePrice.toString(),
        totalUnits: room.totalUnits,
        maxGuests: room.maxGuests,
      })),
    }));
  };

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

    const categoryId = await this.ensureCategory(
      tenantAccountId,
      body.categoryId,
    );
    const cityId = await this.ensureCity(body.cityId);

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

  updateProperty = async (
    tenantAccountId: string,
    propertyId: string,
    body: UpdatePropertyDTO,
  ) => {
    const property = await this.prisma.property.findFirst({
      where: { id: propertyId, tenantAccountId },
    });

    if (!property) {
      throw new ApiError("Properti tidak ditemukan.", 404);
    }

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

    const categoryId = await this.ensureCategory(
      tenantAccountId,
      body.categoryId,
    );
    const cityId = await this.ensureCity(body.cityId);

    const orderedUrls = [
      body.coverUrl,
      ...body.galleryUrls.filter((url) => url !== body.coverUrl),
    ];
    const images = orderedUrls.map((url, index) => ({
      url,
      sortOrder: index,
    }));

    await this.prisma.$transaction([
      this.prisma.propertyImage.deleteMany({ where: { propertyId } }),
      this.prisma.property.update({
        where: { id: propertyId },
        data: {
          name,
          description,
          address,
          categoryId,
          cityId,
          images: {
            create: images,
          },
        },
      }),
    ]);

    return {
      message: "Properti berhasil diperbarui.",
      id: propertyId,
    };
  };

  deleteProperty = async (tenantAccountId: string, propertyId: string) => {
    const property = await this.prisma.property.findFirst({
      where: { id: propertyId, tenantAccountId },
    });

    if (!property) {
      throw new ApiError("Properti tidak ditemukan.", 404);
    }

    await this.prisma.property.delete({ where: { id: propertyId } });

    return {
      message: "Properti berhasil dihapus.",
      id: propertyId,
    };
  };

  createRoom = async (
    tenantAccountId: string,
    propertyId: string,
    body: CreateRoomDTO,
  ) => {
    await this.ensurePropertyOwner(tenantAccountId, propertyId);

    const name = body.name.trim();
    const description = body.description.trim();
    const price = this.parseDecimal(body.price, "Harga tidak valid.");
    const totalUnits = this.parseInt(
      body.totalUnits,
      "Total unit tidak valid.",
    );
    const maxGuests = this.parseInt(
      body.maxGuests,
      "Maksimal tamu tidak valid.",
    );

    const room = await this.prisma.roomType.create({
      data: {
        propertyId,
        name,
        description,
        basePrice: price,
        totalUnits,
        maxGuests,
      },
    });

    return {
      message: "Room berhasil ditambahkan.",
      id: room.id,
    };
  };

  updateRoom = async (
    tenantAccountId: string,
    roomId: string,
    body: UpdateRoomDTO,
  ) => {
    const room = await this.prisma.roomType.findFirst({
      where: {
        id: roomId,
        property: { tenantAccountId },
      },
    });

    if (!room) {
      throw new ApiError("Room tidak ditemukan.", 404);
    }

    const name = body.name.trim();
    const description = body.description.trim();
    const price = this.parseDecimal(body.price, "Harga tidak valid.");
    const totalUnits = this.parseInt(
      body.totalUnits,
      "Total unit tidak valid.",
    );
    const maxGuests = this.parseInt(
      body.maxGuests,
      "Maksimal tamu tidak valid.",
    );

    await this.prisma.roomType.update({
      where: { id: roomId },
      data: {
        name,
        description,
        basePrice: price,
        totalUnits,
        maxGuests,
      },
    });

    return {
      message: "Room berhasil diperbarui.",
      id: roomId,
    };
  };

  deleteRoom = async (tenantAccountId: string, roomId: string) => {
    const room = await this.prisma.roomType.findFirst({
      where: {
        id: roomId,
        property: { tenantAccountId },
      },
    });

    if (!room) {
      throw new ApiError("Room tidak ditemukan.", 404);
    }

    await this.prisma.roomType.delete({ where: { id: roomId } });

    return {
      message: "Room berhasil dihapus.",
      id: roomId,
    };
  };

  private async ensurePropertyOwner(
    tenantAccountId: string,
    propertyId: string,
  ) {
    const property = await this.prisma.property.findFirst({
      where: { id: propertyId, tenantAccountId },
      select: { id: true },
    });

    if (!property) {
      throw new ApiError("Properti tidak ditemukan.", 404);
    }
  }

  private async ensureCategory(tenantAccountId: string, categoryIdRaw: string) {
    let categoryId: bigint;
    try {
      categoryId = BigInt(categoryIdRaw);
    } catch {
      throw new ApiError("Kategori tidak valid.", 400);
    }

    const category = await this.prisma.propertyCategory.findFirst({
      where: {
        id: categoryId,
        tenantAccountId,
        isActive: true,
      },
      select: { id: true },
    });

    if (!category) {
      throw new ApiError("Kategori tidak ditemukan.", 404);
    }

    return categoryId;
  }

  private async ensureCity(cityIdRaw: string) {
    let cityId: bigint;
    try {
      cityId = BigInt(cityIdRaw);
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

    return cityId;
  }

  private parseDecimal(value: string, message: string) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new ApiError(message, 400);
    }
    return value;
  }

  private parseInt(value: string, message: string) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new ApiError(message, 400);
    }
    return Math.floor(parsed);
  }
}
