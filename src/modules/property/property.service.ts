import { Prisma, PrismaClient } from "@prisma/client";
import { ApiError } from "../../utils/api-error.js";
import { CreatePropertyDTO } from "./dto/create-property.dto.js";
import { UpdatePropertyDTO } from "./dto/update-property.dto.js";
import { CreateRoomDTO } from "./dto/create-room.dto.js";
import { UpdateRoomDTO } from "./dto/update-room.dto.js";
import { SearchPropertyQueryDTO } from "./dto/search-property.dto.js";
import { ListPropertyQueryDTO } from "./dto/list-property-query.dto.js";

const MAX_GALLERY_IMAGES = 5;

export class PropertyService {
  constructor(private prisma: PrismaClient) {}

  listPublicCategories = async () => {
    const categories = await this.prisma.propertyCategory.findMany({
      where: {
        isActive: true,
      },
      distinct: ["name"],
      orderBy: { name: "asc" },
      select: {
        name: true,
      },
    });

    return categories.map((category) => ({
      name: category.name,
    }));
  };

  listPublicCities = async (search: string, limit: number) => {
    const cities = await this.prisma.city.findMany({
      where: {
        properties: {
          some: {},
        },
        ...(search
          ? {
              name: { contains: search, mode: "insensitive" as const },
            }
          : {}),
      },
      orderBy: { name: "asc" },
      take: limit,
      select: {
        id: true,
        name: true,
        provinceName: true,
        province: {
          select: {
            name: true,
          },
        },
      },
    });

    return cities.map((city) => ({
      id: city.id.toString(),
      name: city.name,
      province: city.province?.name ?? city.provinceName ?? null,
    }));
  };

  listPublicProperties = async (query: SearchPropertyQueryDTO) => {
    const startDateRaw = query.start_date;
    const endDateRaw = query.end_date;
    const nightsRaw = query.nights;

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
    const hasNightsInput =
      typeof nightsRaw === "string" && nightsRaw.trim().length > 0;
    const parsedNights = this.parseOptionalInt(nightsRaw);

    if (hasNightsInput && parsedNights < 1) {
      throw new ApiError("Durasi menginap minimal 1 malam.", 400);
    }

    if (!startDate && (endDate || parsedNights > 0)) {
      throw new ApiError(
        "Tanggal mulai wajib diisi saat memilih durasi atau tanggal akhir.",
        400,
      );
    }

    let stayStartDate = this.getTodayUtcDate();
    let stayEndDate = stayStartDate;

    if (startDate) {
      stayStartDate = startDate;
      if (parsedNights > 0) {
        if (parsedNights > 30) {
          throw new ApiError("Durasi menginap maksimal 30 malam.", 400);
        }
        stayEndDate = this.addDays(startDate, parsedNights - 1);
      } else if (endDate) {
        if (endDate.getTime() <= startDate.getTime()) {
          throw new ApiError("Tanggal akhir harus setelah tanggal mulai.", 400);
        }
        stayEndDate = this.addDays(endDate, -1);
      } else {
        stayEndDate = startDate;
      }
    }

    const rawPage = Number(query.page ?? 1);
    const rawLimit = Number(query.limit ?? 8);
    const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
    const limit =
      Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 24) : 8;
    const skip = (page - 1) * limit;

    const cityId = this.parseOptionalBigInt(query.city_id, "Kota tidak valid.");
    const locTerm = query.loc_term?.trim();
    const propertyName = query.property_name?.trim();
    const category = query.category?.trim();
    const sortBy = query.sort_by ?? "name";
    const sortOrder = query.sort_order ?? "asc";

    const filters: Prisma.Sql[] = [];
    if (cityId !== null) {
      filters.push(Prisma.sql`p.city_id = ${cityId}`);
    }
    if (locTerm) {
      const likeTerm = `%${locTerm}%`;
      filters.push(
        Prisma.sql`
          (
            p.name ILIKE ${likeTerm}
            OR p.address ILIKE ${likeTerm}
            OR c.name ILIKE ${likeTerm}
            OR c.province ILIKE ${likeTerm}
            OR pv.name ILIKE ${likeTerm}
          )
        `,
      );
    }
    if (propertyName) {
      filters.push(Prisma.sql`p.name ILIKE ${`%${propertyName}%`}`);
    }
    if (category) {
      filters.push(Prisma.sql`cat.name ILIKE ${`%${category}%`}`);
    }

    const filterSql =
      filters.length > 0
        ? Prisma.sql`${Prisma.join(filters, " AND ")}`
        : Prisma.sql`TRUE`;

    const baseSearchCtes = Prisma.sql`
      WITH requested_dates AS (
        SELECT gs::date AS stay_date
        FROM generate_series(
          ${this.toDateKey(stayStartDate)}::date,
          ${this.toDateKey(stayEndDate)}::date,
          interval '1 day'
        ) AS gs
      ),
      eligible_rooms AS (
        SELECT
          rt.id AS room_id,
          rt.property_id,
          MIN(COALESCE(rtc.price, rt.base_price)) AS room_min_price
        FROM room_types rt
        CROSS JOIN requested_dates rd
        LEFT JOIN room_type_calendar rtc
          ON rtc.room_type_id = rt.id
          AND rtc.date = rd.stay_date
        WHERE rt.total_units >= ${requiredRooms}
          AND (${totalGuests}::int = 0 OR rt.capacity >= ${totalGuests})
        GROUP BY rt.id, rt.property_id
        HAVING BOOL_AND(COALESCE(rtc.is_closed, false) = false)
          AND BOOL_AND(
            COALESCE(rtc.available_units, rt.total_units) >= ${requiredRooms}
          )
      ),
      property_prices AS (
        SELECT
          er.property_id,
          MIN(er.room_min_price) AS min_price
        FROM eligible_rooms er
        GROUP BY er.property_id
      ),
      filtered_properties AS (
        SELECT
          p.id,
          p.name,
          p.address,
          c.name AS city_name,
          COALESCE(pv.name, c.province) AS province_name,
          cat.id AS category_id,
          cat.name AS category_name,
          pp.min_price,
          cover.url AS cover_url
        FROM property_prices pp
        JOIN properties p ON p.id = pp.property_id
        JOIN cities c ON c.id = p.city_id
        LEFT JOIN provinces pv ON pv.id = c.province_id
        JOIN property_categories cat ON cat.id = p.category_id
        LEFT JOIN LATERAL (
          SELECT pi.url
          FROM property_images pi
          WHERE pi.property_id = p.id
          ORDER BY pi.sort_order ASC, pi.id ASC
          LIMIT 1
        ) cover ON TRUE
        WHERE ${filterSql}
      )
    `;

    const orderBySql =
      sortBy === "price"
        ? sortOrder === "desc"
          ? Prisma.sql`ORDER BY fp.min_price DESC, fp.name DESC, fp.id DESC`
          : Prisma.sql`ORDER BY fp.min_price ASC, fp.name ASC, fp.id ASC`
        : sortOrder === "desc"
          ? Prisma.sql`ORDER BY fp.name DESC, fp.min_price DESC, fp.id DESC`
          : Prisma.sql`ORDER BY fp.name ASC, fp.min_price ASC, fp.id ASC`;

    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        name: string;
        address: string | null;
        cityName: string | null;
        provinceName: string | null;
        categoryId: bigint | number | string | null;
        categoryName: string | null;
        coverUrl: string | null;
        minPrice: Prisma.Decimal | number | string | null;
      }>
    >(Prisma.sql`
      ${baseSearchCtes}
      SELECT
        fp.id,
        fp.name,
        fp.address,
        fp.city_name AS "cityName",
        fp.province_name AS "provinceName",
        fp.category_id AS "categoryId",
        fp.category_name AS "categoryName",
        fp.cover_url AS "coverUrl",
        fp.min_price AS "minPrice"
      FROM filtered_properties fp
      ${orderBySql}
      LIMIT ${limit}
      OFFSET ${skip}
    `);

    const [totalRow] = await this.prisma.$queryRaw<
      Array<{ total: bigint | number | string }>
    >(Prisma.sql`
      ${baseSearchCtes}
      SELECT COUNT(*)::bigint AS total
      FROM filtered_properties
    `);

    const categories = await this.prisma.$queryRaw<
      Array<{ name: string | null; count: bigint | number | string }>
    >(Prisma.sql`
      ${baseSearchCtes}
      SELECT fp.category_name AS name, COUNT(*)::bigint AS count
      FROM filtered_properties fp
      GROUP BY fp.category_name
      ORDER BY fp.category_name ASC
    `);

    const total = this.parseIntegerLike(totalRow?.total);
    const data = rows.map((row) => ({
      id: row.id,
      name: row.name,
      address: row.address,
      city: row.cityName ?? null,
      province: row.provinceName ?? null,
      categoryId: row.categoryId !== null ? String(row.categoryId) : null,
      categoryName: row.categoryName ?? null,
      coverUrl: row.coverUrl ?? null,
      minPrice:
        row.minPrice !== null ? this.decimalToString(row.minPrice) : null,
    }));
    const categoryMeta = categories
      .filter(
        (item): item is { name: string; count: bigint | number | string } =>
          Boolean(item.name),
      )
      .map((item) => ({
        name: item.name,
        count: this.parseIntegerLike(item.count),
      }));

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        hasNext: page * limit < total,
        hasPrev: page > 1,
        categories: categoryMeta,
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

  listProperties = async (
    tenantAccountId: string,
    query: ListPropertyQueryDTO,
  ) => {
    const rawPage = Number(query.page ?? 1);
    const rawLimit = Number(query.limit ?? 20);
    const page = Number.isFinite(rawPage) && rawPage >= 1 ? rawPage : 1;
    const limit =
      Number.isFinite(rawLimit) && rawLimit >= 1 ? Math.min(rawLimit, 100) : 20;

    const [properties, total] = await this.prisma.$transaction([
      this.prisma.property.findMany({
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
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.property.count({
        where: { tenantAccountId },
      }),
    ]);

    return {
      data: properties.map((property) => ({
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
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
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

  private addDays(date: Date, days: number) {
    const next = new Date(date.getTime());
    next.setUTCDate(next.getUTCDate() + days);
    return next;
  }

  private toDateKey(date: Date) {
    return date.toISOString().slice(0, 10);
  }

  private getTodayUtcDate() {
    const now = new Date();
    return new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
  }

  private parseInt(value: string, message: string) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new ApiError(message, 400);
    }
    return Math.floor(parsed);
  }

  private parseOptionalBigInt(value: string | undefined, message: string) {
    if (!value?.trim()) return null;
    try {
      return BigInt(value);
    } catch {
      throw new ApiError(message, 400);
    }
  }

  private parseIntegerLike(value: bigint | number | string | null | undefined) {
    if (typeof value === "bigint") return Number(value);
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    if (typeof value === "string") {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  }

  private decimalToString(value: Prisma.Decimal | number | string) {
    if (typeof value === "string") return value;
    if (typeof value === "number") return String(value);
    return value.toString();
  }
}
