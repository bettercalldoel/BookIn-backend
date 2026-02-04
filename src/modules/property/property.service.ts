import { PrismaClient } from "@prisma/client";
import { ApiError } from "../../utils/api-error.js";
import { CreatePropertyDTO } from "./dto/create-property.dto.js";
import { UpdatePropertyDTO } from "./dto/update-property.dto.js";
import { CreateRoomDTO } from "./dto/create-room.dto.js";
import { UpdateRoomDTO } from "./dto/update-room.dto.js";
import { SearchPropertyQueryDTO } from "./dto/search-property.dto.js";

const MAX_GALLERY_IMAGES = 5;

export class PropertyService {
  constructor(private prisma: PrismaClient) {}

  listPublicProperties = async (query: SearchPropertyQueryDTO) => {
    const startDateRaw = query.start_date;
    const endDateRaw = query.end_date;

    if ((startDateRaw && !endDateRaw) || (!startDateRaw && endDateRaw)) {
      throw new ApiError("Tanggal mulai dan akhir harus diisi.", 400);
    }

    const totalGuests =
      this.parseOptionalInt(query.adults) +
      this.parseOptionalInt(query.children);
    const requiredRooms = Math.max(1, this.parseOptionalInt(query.rooms));

    const startDate = startDateRaw
      ? this.parseDate(startDateRaw, "Tanggal mulai")
      : null;
    const endDate = endDateRaw
      ? this.parseDate(endDateRaw, "Tanggal akhir")
      : null;

    if (startDate && endDate && endDate.getTime() <= startDate.getTime()) {
      throw new ApiError("Tanggal akhir harus setelah tanggal mulai.", 400);
    }

    const stayDates =
      startDate && endDate ? this.buildStayDates(startDate, endDate) : [];

    const rawPage = Number(query.page ?? 1);
    const rawLimit = Number(query.limit ?? 8);
    const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
    const limit =
      Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 24) : 8;
    const skip = (page - 1) * limit;

    const locTerm = query.loc_term?.trim();

    const where =
      locTerm && locTerm.length > 0
        ? {
            OR: [
              { name: { contains: locTerm, mode: "insensitive" as const } },
              {
                address: { contains: locTerm, mode: "insensitive" as const },
              },
              {
                city: {
                  name: { contains: locTerm, mode: "insensitive" as const },
                },
              },
              {
                city: {
                  provinceName: {
                    contains: locTerm,
                    mode: "insensitive" as const,
                  },
                },
              },
              {
                city: {
                  province: {
                    name: { contains: locTerm, mode: "insensitive" as const },
                  },
                },
              },
            ],
          }
        : {};

    const [data, total] = await this.prisma.$transaction([
      this.prisma.property.findMany({
        where,
        skip,
        take: limit,
        include: {
          images: { orderBy: { sortOrder: "asc" } },
          city: {
            select: {
              name: true,
              provinceName: true,
              province: { select: { name: true } },
            },
          },
          roomTypes: {
            select: {
              basePrice: true,
              totalUnits: true,
              maxGuests: true,
              calendar: stayDates.length
                ? {
                    where: {
                      date: { in: stayDates },
                    },
                  }
                : false,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.property.count({ where }),
    ]);

    const items = data.map((property) => {
      const availableRooms = property.roomTypes.filter((room) => {
        if (totalGuests > 0 && room.maxGuests < totalGuests) return false;
        if (stayDates.length === 0) return true;

        const calendarMap = new Map(
          (room.calendar ?? []).map((entry) => [
            this.toDateKey(entry.date),
            entry,
          ]),
        );

        return stayDates.every((date) => {
          const entry = calendarMap.get(this.toDateKey(date));
          if (entry?.isClosed) return false;
          const availableUnits = entry?.availableUnits ?? room.totalUnits;
          return availableUnits >= requiredRooms;
        });
      });

      const prices = availableRooms.map((room) => Number(room.basePrice));
      const minPrice =
        prices.length > 0 ? Math.min(...prices).toString() : null;
      return {
        id: property.id,
        name: property.name,
        address: property.address,
        city: property.city?.name ?? null,
        province:
          property.city?.province?.name ?? property.city?.provinceName ?? null,
        coverUrl: property.images[0]?.url ?? null,
        minPrice,
      };
    });

    const filteredItems = items.filter((item) => item.minPrice !== null);
    const shouldFilterByAvailability = stayDates.length > 0 || totalGuests > 0;
    const totalCount = shouldFilterByAvailability
      ? filteredItems.length
      : total;

    return {
      data: filteredItems,
      meta: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit) || 1,
      },
    };
  };

  getPublicProperty = async (propertyId: string) => {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      include: {
        images: { orderBy: { sortOrder: "asc" } },
        category: { select: { name: true } },
        city: {
          select: {
            name: true,
            provinceName: true,
            province: { select: { name: true } },
          },
        },
        roomTypes: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            name: true,
            description: true,
            basePrice: true,
            totalUnits: true,
            maxGuests: true,
          },
        },
      },
    });

    if (!property) {
      throw new ApiError("Properti tidak ditemukan.", 404);
    }

    return {
      id: property.id,
      name: property.name,
      description: property.description,
      address: property.address,
      categoryName: property.category?.name ?? null,
      cityName: property.city?.name ?? null,
      province:
        property.city?.province?.name ?? property.city?.provinceName ?? null,
      coverUrl: property.images[0]?.url ?? null,
      galleryUrls: property.images.map((image) => image.url),
      rooms: property.roomTypes.map((room) => ({
        id: room.id,
        name: room.name,
        description: room.description,
        basePrice: room.basePrice.toString(),
        totalUnits: room.totalUnits,
        maxGuests: room.maxGuests,
      })),
    };
  };

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

  private parseOptionalInt(value?: string) {
    if (!value) return 0;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return Math.floor(parsed);
  }

  private parseDate(value: string, label: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new ApiError(`${label} harus berformat YYYY-MM-DD.`, 400);
    }

    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));

    if (Number.isNaN(date.getTime())) {
      throw new ApiError(`${label} tidak valid.`, 400);
    }

    return date;
  }

  private buildStayDates(startDate: Date, endDate: Date) {
    const dates: Date[] = [];
    const cursor = new Date(startDate.getTime());

    while (cursor.getTime() < endDate.getTime()) {
      dates.push(new Date(cursor.getTime()));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return dates;
  }

  private toDateKey(date: Date) {
    return date.toISOString().slice(0, 10);
  }

  private parseInt(value: string, message: string) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new ApiError(message, 400);
    }
    return Math.floor(parsed);
  }
}
