import { Prisma } from "@prisma/client";
import { ApiError } from "../../utils/api-error.js";
import { PROPERTY_AMENITY_KEY_SET } from "./property-amenities.js";
const MAX_GALLERY_IMAGES = 5;
const GEOCODE_TIMEOUT_MS = 3500;
class PropertyService {
  constructor(prisma) {
    this.prisma = prisma;
  }
  listPublicCategories = async (search, options) => {
    const where = {
      isActive: true,
      ...search ? { name: { contains: search, mode: "insensitive" } } : {}
    };
    const skip = (options.page - 1) * options.limit;
    const [categories, totalRows] = await this.prisma.$transaction([
      this.prisma.propertyCategory.findMany({
        where,
        distinct: ["name"],
        orderBy: { name: options.sortOrder },
        skip,
        take: options.limit,
        select: {
          name: true
        }
      }),
      this.prisma.propertyCategory.findMany({
        where,
        distinct: ["name"],
        select: {
          name: true
        }
      })
    ]);
    const total = totalRows.length;
    const totalPages = Math.max(1, Math.ceil(total / options.limit));
    return {
      data: categories.map((category) => ({
        name: category.name
      })),
      meta: {
        page: options.page,
        limit: options.limit,
        total,
        totalPages,
        hasNext: options.page < totalPages,
        hasPrev: options.page > 1,
        search: search || null,
        sortBy: options.sortBy ?? "name",
        sortOrder: options.sortOrder
      }
    };
  };
  listPublicCities = async (search, options) => {
    const cityWhere = {
      properties: {
        some: {}
      },
      ...search ? {
        name: { contains: search, mode: "insensitive" }
      } : {}
    };
    const skip = (options.page - 1) * options.limit;
    const [cities, total] = await this.prisma.$transaction([
      this.prisma.city.findMany({
        where: cityWhere,
        orderBy: { name: options.sortOrder },
        skip,
        take: options.limit,
        select: {
          id: true,
          name: true,
          provinceName: true
        }
      }),
      this.prisma.city.count({ where: cityWhere })
    ]);
    const totalPages = Math.max(1, Math.ceil(total / options.limit));
    return {
      data: cities.map((city) => ({
        id: city.id.toString(),
        name: city.name,
        province: city.provinceName ?? null
      })),
      meta: {
        page: options.page,
        limit: options.limit,
        total,
        totalPages,
        hasNext: options.page < totalPages,
        hasPrev: options.page > 1
      }
    };
  };
  listPublicProperties = async (query) => {
    const startDateRaw = query.start_date;
    const endDateRaw = query.end_date;
    const nightsRaw = query.nights;
    const totalGuests = this.parseOptionalInt(query.adults) + this.parseOptionalInt(query.children);
    const requiredRooms = Math.max(1, this.parseOptionalInt(query.rooms));
    const startDate = startDateRaw ? this.parseDate(startDateRaw, "Tanggal mulai") : null;
    const endDate = endDateRaw ? this.parseDate(endDateRaw, "Tanggal akhir") : null;
    const hasNightsInput = typeof nightsRaw === "string" && nightsRaw.trim().length > 0;
    const parsedNights = this.parseOptionalInt(nightsRaw);
    if (hasNightsInput && parsedNights < 1) {
      throw new ApiError("Durasi menginap minimal 1 malam.", 400);
    }
    if (!startDate && (endDate || parsedNights > 0)) {
      throw new ApiError(
        "Tanggal mulai wajib diisi saat memilih durasi atau tanggal akhir.",
        400
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
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 24) : 8;
    const skip = (page - 1) * limit;
    const cityId = this.parseOptionalBigInt(query.city_id, "Kota tidak valid.");
    const locTerm = query.loc_term?.trim();
    const propertyName = query.property_name?.trim();
    const category = query.category?.trim();
    const sortBy = query.sort_by ?? "name";
    const sortOrder = query.sort_order ?? "asc";
    const amenityFilterKeys = this.parseAmenityKeysCsv(query.amenities);
    const amenityFilterMode = query.amenities_mode === "all" ? "all" : "any";
    const hasNearLatitudeQuery = Boolean(query.lat?.trim());
    const hasNearLongitudeQuery = Boolean(query.lng?.trim());
    if (hasNearLatitudeQuery !== hasNearLongitudeQuery) {
      throw new ApiError(
        "Latitude dan longitude pencarian harus diisi bersamaan.",
        400
      );
    }
    const nearLatitude = this.parseCoordinate(query.lat, -90, 90);
    const nearLongitude = this.parseCoordinate(query.lng, -180, 180);
    if (hasNearLatitudeQuery && nearLatitude === null || hasNearLongitudeQuery && nearLongitude === null) {
      throw new ApiError("Koordinat pencarian tidak valid.", 400);
    }
    const parsedRadiusKm = this.parseOptionalFloat(query.radius_km);
    const nearRadiusKm = hasNearLatitudeQuery ? parsedRadiusKm ?? 1 : null;
    if (nearRadiusKm !== null && (nearRadiusKm <= 0 || nearRadiusKm > 50)) {
      throw new ApiError(
        "Radius pencarian harus antara 0.1 hingga 50 kilometer.",
        400
      );
    }
    const filters = [];
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
        `
      );
    }
    if (propertyName) {
      filters.push(Prisma.sql`p.name ILIKE ${`%${propertyName}%`}`);
    }
    if (category) {
      filters.push(Prisma.sql`cat.name ILIKE ${`%${category}%`}`);
    }
    if (amenityFilterKeys.length > 0) {
      const amenityArraySql = this.toTextArraySql(amenityFilterKeys);
      if (amenityFilterMode === "all") {
        filters.push(Prisma.sql`p.amenity_keys @> ${amenityArraySql}`);
      } else {
        filters.push(Prisma.sql`p.amenity_keys && ${amenityArraySql}`);
      }
    }
    if (nearLatitude !== null && nearLongitude !== null && nearRadiusKm !== null) {
      filters.push(Prisma.sql`
        p.latitude IS NOT NULL
        AND p.longitude IS NOT NULL
        AND (
          6371 * acos(
            LEAST(
              1,
              GREATEST(
                -1,
                cos(radians(${nearLatitude})) * cos(radians(p.latitude::double precision))
                * cos(radians(p.longitude::double precision) - radians(${nearLongitude}))
                + sin(radians(${nearLatitude})) * sin(radians(p.latitude::double precision))
              )
            )
          )
        ) <= ${nearRadiusKm}
      `);
    }
    const filterSql = filters.length > 0 ? Prisma.sql`${Prisma.join(filters, " AND ")}` : Prisma.sql`TRUE`;
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
          p.latitude,
          p.longitude,
          c.name AS city_name,
          COALESCE(pv.name, c.province) AS province_name,
          cat.id AS category_id,
          cat.name AS category_name,
          pp.min_price,
          p.amenity_keys AS amenity_keys,
          p.breakfast_enabled AS breakfast_enabled,
          p.breakfast_price_per_pax AS breakfast_price_per_pax,
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
    const orderBySql = sortBy === "price" ? sortOrder === "desc" ? Prisma.sql`ORDER BY fp.min_price DESC, fp.name DESC, fp.id DESC` : Prisma.sql`ORDER BY fp.min_price ASC, fp.name ASC, fp.id ASC` : sortOrder === "desc" ? Prisma.sql`ORDER BY fp.name DESC, fp.min_price DESC, fp.id DESC` : Prisma.sql`ORDER BY fp.name ASC, fp.min_price ASC, fp.id ASC`;
    const rows = await this.prisma.$queryRaw(Prisma.sql`
      ${baseSearchCtes}
      SELECT
        fp.id,
        fp.name,
        fp.address,
        fp.latitude,
        fp.longitude,
        fp.city_name AS "cityName",
        fp.province_name AS "provinceName",
        fp.category_id AS "categoryId",
        fp.category_name AS "categoryName",
        fp.amenity_keys AS "amenityKeys",
        fp.breakfast_enabled AS "breakfastEnabled",
        fp.breakfast_price_per_pax AS "breakfastPricePerPax",
        fp.cover_url AS "coverUrl",
        fp.min_price AS "minPrice"
      FROM filtered_properties fp
      ${orderBySql}
      LIMIT ${limit}
      OFFSET ${skip}
    `);
    const [totalRow] = await this.prisma.$queryRaw(Prisma.sql`
      ${baseSearchCtes}
      SELECT COUNT(*)::bigint AS total
      FROM filtered_properties
    `);
    const categories = await this.prisma.$queryRaw(Prisma.sql`
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
      latitude: this.decimalToNumber(row.latitude),
      longitude: this.decimalToNumber(row.longitude),
      city: row.cityName ?? null,
      province: row.provinceName ?? null,
      categoryId: row.categoryId !== null ? String(row.categoryId) : null,
      categoryName: row.categoryName ?? null,
      amenityKeys: Array.isArray(row.amenityKeys) ? this.normalizeAmenityKeys(row.amenityKeys) : [],
      breakfast: {
        enabled: row.breakfastEnabled,
        pricePerPax: this.decimalToString(row.breakfastPricePerPax),
        currency: "IDR"
      },
      coverUrl: row.coverUrl ?? null,
      minPrice: row.minPrice !== null ? this.decimalToString(row.minPrice) : null
    }));
    const categoryMeta = categories.filter(
      (item) => Boolean(item.name)
    ).map((item) => ({
      name: item.name,
      count: this.parseIntegerLike(item.count)
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
        categories: categoryMeta
      }
    };
  };
  getPublicProperty = async (propertyId) => {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      include: {
        images: { orderBy: { sortOrder: "asc" } },
        category: { select: { name: true } },
        city: {
          select: {
            name: true,
            provinceName: true
          }
        },
        roomTypes: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            name: true,
            description: true,
            basePrice: true,
            totalUnits: true,
            maxGuests: true
          }
        }
      }
    });
    if (!property) {
      throw new ApiError("Properti tidak ditemukan.", 404);
    }
    return {
      id: property.id,
      name: property.name,
      description: property.description,
      address: property.address,
      latitude: this.decimalToNumber(property.latitude),
      longitude: this.decimalToNumber(property.longitude),
      categoryName: property.category?.name ?? null,
      cityName: property.city?.name ?? null,
      province: property.city?.provinceName ?? null,
      amenityKeys: this.normalizeAmenityKeys(property.amenityKeys),
      breakfast: {
        enabled: property.breakfastEnabled,
        pricePerPax: property.breakfastPricePerPax.toString(),
        currency: property.breakfastCurrency
      },
      coverUrl: property.images[0]?.url ?? null,
      galleryUrls: property.images.map((image) => image.url),
      rooms: property.roomTypes.map((room) => ({
        id: room.id,
        name: room.name,
        description: room.description,
        basePrice: room.basePrice.toString(),
        totalUnits: room.totalUnits,
        maxGuests: room.maxGuests
      }))
    };
  };
  listProperties = async (tenantAccountId, query) => {
    const rawPage = Number(query.page ?? 1);
    const rawLimit = Number(query.limit ?? 20);
    const page = Number.isFinite(rawPage) && rawPage >= 1 ? rawPage : 1;
    const limit = Number.isFinite(rawLimit) && rawLimit >= 1 ? Math.min(rawLimit, 100) : 20;
    const search = query.search?.trim() ?? "";
    const sortBy = query.sortBy ?? "createdAt";
    const sortOrder = query.sortOrder === "asc" ? "asc" : "desc";
    const where = {
      tenantAccountId,
      ...search ? {
        OR: [
          {
            name: { contains: search, mode: "insensitive" }
          },
          {
            address: { contains: search, mode: "insensitive" }
          },
          {
            category: {
              name: { contains: search, mode: "insensitive" }
            }
          },
          {
            city: {
              name: { contains: search, mode: "insensitive" }
            }
          },
          {
            city: {
              provinceName: { contains: search, mode: "insensitive" }
            }
          }
        ]
      } : {}
    };
    const orderBy = sortBy === "name" ? [{ name: sortOrder }, { createdAt: "desc" }] : sortBy === "cityName" ? [{ city: { name: sortOrder } }, { name: "asc" }] : [{ createdAt: sortOrder }, { name: "asc" }];
    const [properties, total] = await this.prisma.$transaction([
      this.prisma.property.findMany({
        where,
        include: {
          images: { orderBy: { sortOrder: "asc" } },
          category: { select: { id: true, name: true } },
          city: {
            select: {
              id: true,
              name: true,
              provinceName: true
            }
          },
          roomTypes: true
        },
        orderBy,
        skip: (page - 1) * limit,
        take: limit
      }),
      this.prisma.property.count({
        where
      })
    ]);
    return {
      data: properties.map((property) => ({
        id: property.id,
        name: property.name,
        description: property.description,
        address: property.address,
        latitude: this.decimalToNumber(property.latitude),
        longitude: this.decimalToNumber(property.longitude),
        categoryId: property.categoryId.toString(),
        categoryName: property.category?.name ?? null,
        cityId: property.cityId.toString(),
        cityName: property.city?.name ?? null,
        province: property.city?.provinceName ?? null,
        amenityKeys: this.normalizeAmenityKeys(property.amenityKeys),
        breakfast: {
          enabled: property.breakfastEnabled,
          pricePerPax: property.breakfastPricePerPax.toString(),
          currency: property.breakfastCurrency
        },
        coverUrl: property.images[0]?.url ?? null,
        galleryUrls: property.images.map((image) => image.url),
        rooms: property.roomTypes.map((room) => ({
          id: room.id,
          name: room.name,
          description: room.description,
          price: room.basePrice.toString(),
          totalUnits: room.totalUnits,
          maxGuests: room.maxGuests
        }))
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        hasNext: page * limit < total,
        hasPrev: page > 1,
        search: search || null,
        sortBy,
        sortOrder
      }
    };
  };
  createProperty = async (tenantAccountId, body) => {
    const name = body.name.trim();
    const description = body.description.trim();
    const address = body.address?.trim() || null;
    const amenityKeys = this.normalizeAmenityKeys(body.amenityKeys ?? []);
    const breakfastEnabled = body.breakfastEnabled ?? false;
    const breakfastPricePerPax = this.parseNonNegativeDecimal(
      body.breakfastPricePerPax,
      "Harga sarapan tidak valid."
    );
    if (!body.galleryUrls.includes(body.coverUrl)) {
      throw new ApiError("Foto sampul harus dipilih dari galeri.", 400);
    }
    if (body.galleryUrls.length > MAX_GALLERY_IMAGES) {
      throw new ApiError(
        `Maksimal ${MAX_GALLERY_IMAGES} foto untuk galeri.`,
        400
      );
    }
    const categoryId = await this.ensureCategory(
      tenantAccountId,
      body.categoryId
    );
    const city = await this.ensureCity(body.cityId);
    await this.ensureNoDuplicatePropertyIdentity({
      tenantAccountId,
      cityId: city.id,
      name,
      address
    });
    const manualCoordinates = this.parseManualCoordinates(
      body.latitude,
      body.longitude
    );
    const coordinates = manualCoordinates ?? await this.resolvePropertyCoordinates({
      address,
      cityName: city.name,
      provinceName: city.provinceName,
      country: city.country
    });
    const orderedUrls = [
      body.coverUrl,
      ...body.galleryUrls.filter((url) => url !== body.coverUrl)
    ];
    const images = orderedUrls.map((url, index) => ({
      url,
      sortOrder: index
    }));
    const property = await this.prisma.property.create({
      data: {
        tenantAccountId,
        categoryId,
        cityId: city.id,
        name,
        description,
        address,
        latitude: coordinates?.latitude ?? null,
        longitude: coordinates?.longitude ?? null,
        amenityKeys,
        breakfastEnabled,
        breakfastPricePerPax,
        breakfastCurrency: "IDR",
        breakfastUpdatedAt: /* @__PURE__ */ new Date(),
        images: {
          create: images
        }
      }
    });
    return {
      message: "Properti berhasil disimpan.",
      id: property.id
    };
  };
  updateProperty = async (tenantAccountId, propertyId, body) => {
    const property = await this.prisma.property.findFirst({
      where: { id: propertyId, tenantAccountId }
    });
    if (!property) {
      throw new ApiError("Properti tidak ditemukan.", 404);
    }
    const name = body.name.trim();
    const description = body.description.trim();
    const address = body.address?.trim() || null;
    const amenityKeys = this.normalizeAmenityKeys(body.amenityKeys ?? []);
    const breakfastEnabled = body.breakfastEnabled ?? property.breakfastEnabled;
    const breakfastPricePerPax = body.breakfastPricePerPax === void 0 ? property.breakfastPricePerPax : this.parseNonNegativeDecimal(
      body.breakfastPricePerPax,
      "Harga sarapan tidak valid."
    );
    const hasBreakfastChanged = breakfastEnabled !== property.breakfastEnabled || breakfastPricePerPax.toString() !== property.breakfastPricePerPax.toString();
    if (!body.galleryUrls.includes(body.coverUrl)) {
      throw new ApiError("Foto sampul harus dipilih dari galeri.", 400);
    }
    if (body.galleryUrls.length > MAX_GALLERY_IMAGES) {
      throw new ApiError(
        `Maksimal ${MAX_GALLERY_IMAGES} foto untuk galeri.`,
        400
      );
    }
    const categoryId = await this.ensureCategory(
      tenantAccountId,
      body.categoryId
    );
    const city = await this.ensureCity(body.cityId);
    const hasIdentityChanged = property.cityId !== city.id || this.normalizePropertyIdentityText(property.name) !== this.normalizePropertyIdentityText(name) || this.normalizePropertyIdentityText(property.address) !== this.normalizePropertyIdentityText(address);
    if (hasIdentityChanged) {
      await this.ensureNoDuplicatePropertyIdentity({
        tenantAccountId,
        cityId: city.id,
        name,
        address,
        excludePropertyId: propertyId
      });
    }
    const hasLocationChanged = property.cityId !== city.id || (property.address ?? null) !== address;
    const manualCoordinates = this.parseManualCoordinates(
      body.latitude,
      body.longitude
    );
    const coordinates = manualCoordinates ?? await this.resolvePropertyCoordinates({
      address,
      cityName: city.name,
      provinceName: city.provinceName,
      country: city.country
    });
    const nextLatitude = coordinates ? coordinates.latitude : hasLocationChanged ? null : property.latitude;
    const nextLongitude = coordinates ? coordinates.longitude : hasLocationChanged ? null : property.longitude;
    const orderedUrls = [
      body.coverUrl,
      ...body.galleryUrls.filter((url) => url !== body.coverUrl)
    ];
    const images = orderedUrls.map((url, index) => ({
      url,
      sortOrder: index
    }));
    await this.prisma.$transaction([
      this.prisma.propertyImage.deleteMany({ where: { propertyId } }),
      this.prisma.property.update({
        where: { id: propertyId },
        data: {
          name,
          description,
          address,
          amenityKeys,
          categoryId,
          cityId: city.id,
          latitude: nextLatitude,
          longitude: nextLongitude,
          breakfastEnabled,
          breakfastPricePerPax,
          breakfastCurrency: "IDR",
          breakfastUpdatedAt: hasBreakfastChanged ? /* @__PURE__ */ new Date() : property.breakfastUpdatedAt,
          images: {
            create: images
          }
        }
      })
    ]);
    return {
      message: "Properti berhasil diperbarui.",
      id: propertyId
    };
  };
  updatePropertyBreakfast = async (tenantAccountId, propertyId, body) => {
    const property = await this.prisma.property.findFirst({
      where: { id: propertyId, tenantAccountId },
      select: {
        id: true,
        breakfastEnabled: true,
        breakfastPricePerPax: true,
        breakfastCurrency: true
      }
    });
    if (!property) {
      throw new ApiError("Properti tidak ditemukan.", 404);
    }
    const breakfastPricePerPax = this.parseNonNegativeDecimal(
      body.breakfastPricePerPax,
      "Harga sarapan tidak valid."
    );
    const updated = await this.prisma.property.update({
      where: { id: propertyId },
      data: {
        breakfastEnabled: body.breakfastEnabled,
        breakfastPricePerPax,
        breakfastCurrency: property.breakfastCurrency || "IDR",
        breakfastUpdatedAt: /* @__PURE__ */ new Date()
      },
      select: {
        id: true,
        breakfastEnabled: true,
        breakfastPricePerPax: true,
        breakfastCurrency: true,
        breakfastUpdatedAt: true
      }
    });
    return {
      message: "Pengaturan sarapan berhasil diperbarui.",
      data: {
        propertyId: updated.id,
        breakfastEnabled: updated.breakfastEnabled,
        breakfastPricePerPax: updated.breakfastPricePerPax.toString(),
        breakfastCurrency: updated.breakfastCurrency,
        breakfastUpdatedAt: updated.breakfastUpdatedAt
      }
    };
  };
  deleteProperty = async (tenantAccountId, propertyId) => {
    const property = await this.prisma.property.findFirst({
      where: { id: propertyId, tenantAccountId }
    });
    if (!property) {
      throw new ApiError("Properti tidak ditemukan.", 404);
    }
    await this.prisma.property.delete({ where: { id: propertyId } });
    return {
      message: "Properti berhasil dihapus.",
      id: propertyId
    };
  };
  createRoom = async (tenantAccountId, propertyId, body) => {
    await this.ensurePropertyOwner(tenantAccountId, propertyId);
    const name = body.name.trim();
    const description = body.description.trim();
    const price = this.parseDecimal(body.price, "Harga tidak valid.");
    const totalUnits = this.parseInt(
      body.totalUnits,
      "Total unit tidak valid."
    );
    const maxGuests = this.parseInt(
      body.maxGuests,
      "Maksimal tamu tidak valid."
    );
    const room = await this.prisma.roomType.create({
      data: {
        propertyId,
        name,
        description,
        basePrice: price,
        totalUnits,
        maxGuests
      }
    });
    return {
      message: "Room berhasil ditambahkan.",
      id: room.id
    };
  };
  updateRoom = async (tenantAccountId, roomId, body) => {
    const room = await this.prisma.roomType.findFirst({
      where: {
        id: roomId,
        property: { tenantAccountId }
      }
    });
    if (!room) {
      throw new ApiError("Room tidak ditemukan.", 404);
    }
    const name = body.name.trim();
    const description = body.description.trim();
    const price = this.parseDecimal(body.price, "Harga tidak valid.");
    const totalUnits = this.parseInt(
      body.totalUnits,
      "Total unit tidak valid."
    );
    const maxGuests = this.parseInt(
      body.maxGuests,
      "Maksimal tamu tidak valid."
    );
    await this.prisma.roomType.update({
      where: { id: roomId },
      data: {
        name,
        description,
        basePrice: price,
        totalUnits,
        maxGuests
      }
    });
    return {
      message: "Room berhasil diperbarui.",
      id: roomId
    };
  };
  deleteRoom = async (tenantAccountId, roomId) => {
    const room = await this.prisma.roomType.findFirst({
      where: {
        id: roomId,
        property: { tenantAccountId }
      }
    });
    if (!room) {
      throw new ApiError("Room tidak ditemukan.", 404);
    }
    await this.prisma.roomType.delete({ where: { id: roomId } });
    return {
      message: "Room berhasil dihapus.",
      id: roomId
    };
  };
  normalizePropertyIdentityText(value) {
    return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  }
  async ensureNoDuplicatePropertyIdentity(input) {
    const normalizedName = this.normalizePropertyIdentityText(input.name);
    const normalizedAddress = this.normalizePropertyIdentityText(input.address);
    const existing = await this.prisma.property.findMany({
      where: {
        tenantAccountId: input.tenantAccountId,
        cityId: input.cityId,
        ...input.excludePropertyId ? {
          id: {
            not: input.excludePropertyId
          }
        } : {},
        name: {
          equals: input.name,
          mode: "insensitive"
        }
      },
      select: {
        id: true,
        name: true,
        address: true
      },
      take: 20
    });
    const duplicate = existing.find(
      (property) => this.normalizePropertyIdentityText(property.name) === normalizedName && this.normalizePropertyIdentityText(property.address) === normalizedAddress
    );
    if (duplicate) {
      throw new ApiError(
        "Properti dengan nama dan alamat yang sama di kota ini sudah ada.",
        409
      );
    }
  }
  async ensurePropertyOwner(tenantAccountId, propertyId) {
    const property = await this.prisma.property.findFirst({
      where: { id: propertyId, tenantAccountId },
      select: { id: true }
    });
    if (!property) {
      throw new ApiError("Properti tidak ditemukan.", 404);
    }
  }
  async ensureCategory(tenantAccountId, categoryIdRaw) {
    const categoryId = this.parseCategoryId(categoryIdRaw);
    const category = await this.prisma.propertyCategory.findFirst({
      where: { id: categoryId, tenantAccountId, isActive: true },
      select: { id: true }
    });
    if (!category) throw new ApiError("Kategori tidak ditemukan.", 404);
    return categoryId;
  }
  parseCategoryId(categoryIdRaw) {
    try {
      return BigInt(categoryIdRaw);
    } catch {
      throw new ApiError("Kategori tidak valid.", 400);
    }
  }
  async ensureCity(cityIdRaw) {
    let cityId;
    try {
      cityId = BigInt(cityIdRaw);
    } catch {
      throw new ApiError("Kota tidak valid.", 400);
    }
    const city = await this.prisma.city.findUnique({
      where: { id: cityId },
      select: {
        id: true,
        name: true,
        provinceName: true,
        country: true
      }
    });
    if (!city) {
      throw new ApiError("Kota tidak ditemukan.", 404);
    }
    return {
      id: city.id,
      name: city.name,
      provinceName: city.provinceName ?? null,
      country: city.country ?? null
    };
  }
  async resolvePropertyCoordinates(input) {
    const candidates = this.buildGeocodeQueryCandidates(input);
    if (candidates.length === 0) return null;
    for (const query of candidates) {
      const geocodeUrl = new URL("https://nominatim.openstreetmap.org/search");
      geocodeUrl.searchParams.set("q", query);
      geocodeUrl.searchParams.set("format", "jsonv2");
      geocodeUrl.searchParams.set("limit", "1");
      geocodeUrl.searchParams.set("addressdetails", "0");
      const abortController = new AbortController();
      const timeoutId = setTimeout(
        () => abortController.abort(),
        GEOCODE_TIMEOUT_MS
      );
      try {
        const response = await fetch(geocodeUrl.toString(), {
          signal: abortController.signal,
          headers: {
            "Accept-Language": "id,en",
            "User-Agent": "BookIn/1.0 (property-geocoding)"
          }
        });
        if (!response.ok) {
          continue;
        }
        const payload = await response.json();
        const firstResult = payload[0];
        const latitude = this.parseCoordinate(firstResult?.lat, -90, 90);
        const longitude = this.parseCoordinate(firstResult?.lon, -180, 180);
        if (latitude === null || longitude === null) {
          continue;
        }
        return {
          latitude: latitude.toFixed(7),
          longitude: longitude.toFixed(7)
        };
      } catch {
        continue;
      } finally {
        clearTimeout(timeoutId);
      }
    }
    return null;
  }
  buildGeocodeQueryCandidates(input) {
    const address = input.address?.trim() ?? "";
    const cityName = input.cityName.trim();
    const province = input.provinceName?.trim() ?? "";
    const country = input.country?.trim() || "Indonesia";
    const candidates = [
      [address, cityName, province, country].filter(Boolean).join(", "),
      [address, cityName, country].filter(Boolean).join(", "),
      address,
      [cityName, province, country].filter(Boolean).join(", ")
    ].map((query) => query.trim()).filter((query) => query.length > 0);
    return Array.from(new Set(candidates));
  }
  parseManualCoordinates(latitudeValue, longitudeValue) {
    const hasLatitude = latitudeValue !== void 0;
    const hasLongitude = longitudeValue !== void 0;
    if (!hasLatitude && !hasLongitude) return null;
    if (!hasLatitude || !hasLongitude) {
      throw new ApiError("Latitude dan longitude harus diisi bersamaan.", 400);
    }
    const latitude = this.parseCoordinate(latitudeValue, -90, 90);
    const longitude = this.parseCoordinate(longitudeValue, -180, 180);
    if (latitude === null || longitude === null) {
      throw new ApiError("Koordinat lokasi tidak valid.", 400);
    }
    return {
      latitude: latitude.toFixed(7),
      longitude: longitude.toFixed(7)
    };
  }
  parseCoordinate(value, min, max) {
    if (value === void 0) return null;
    if (typeof value === "string" && !value.trim()) return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) return null;
    return parsed;
  }
  parseDecimal(value, message) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new ApiError(message, 400);
    }
    return value;
  }
  parseNonNegativeDecimal(value, message) {
    if (value === null || value === void 0 || value === "") {
      return "0";
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new ApiError(message, 400);
    }
    return Math.round(parsed).toString();
  }
  parseOptionalInt(value) {
    if (!value) return 0;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return Math.floor(parsed);
  }
  parseOptionalFloat(value) {
    if (!value?.trim()) return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    return parsed;
  }
  parseDate(value, label) {
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
  buildStayDates(startDate, endDate) {
    const dates = [];
    const cursor = new Date(startDate.getTime());
    while (cursor.getTime() < endDate.getTime()) {
      dates.push(new Date(cursor.getTime()));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return dates;
  }
  addDays(date, days) {
    const next = new Date(date.getTime());
    next.setUTCDate(next.getUTCDate() + days);
    return next;
  }
  toDateKey(date) {
    return date.toISOString().slice(0, 10);
  }
  getTodayUtcDate() {
    const now = /* @__PURE__ */ new Date();
    return new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    );
  }
  parseInt(value, message) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new ApiError(message, 400);
    }
    return Math.floor(parsed);
  }
  parseOptionalBigInt(value, message) {
    if (!value?.trim()) return null;
    try {
      return BigInt(value);
    } catch {
      throw new ApiError(message, 400);
    }
  }
  parseAmenityKeysCsv(value) {
    if (!value?.trim()) return [];
    return this.normalizeAmenityKeys(value.split(","));
  }
  normalizeAmenityKeys(values) {
    const uniqueValues = this.buildUniqueAmenityKeys(values);
    const invalidValues = this.findInvalidAmenityKeys(uniqueValues);
    if (invalidValues.length > 0) throw new ApiError(`Fasilitas tidak valid: ${invalidValues.join(", ")}.`, 400);
    return uniqueValues;
  }
  buildUniqueAmenityKeys(values) {
    return Array.from(
      new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))
    );
  }
  findInvalidAmenityKeys(values) {
    return values.filter((value) => !PROPERTY_AMENITY_KEY_SET.has(value));
  }
  toTextArraySql(values) {
    return Prisma.sql`ARRAY[${Prisma.join(
      values.map((value) => Prisma.sql`${value}`)
    )}]::text[]`;
  }
  parseIntegerLike(value) {
    if (typeof value === "bigint") return Number(value);
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    if (typeof value === "string") {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  }
  decimalToString(value) {
    if (typeof value === "string") return value;
    if (typeof value === "number") return String(value);
    return value.toString();
  }
  decimalToNumber(value) {
    if (value === null || value === void 0) return null;
    const parsed = typeof value === "number" ? value : Number(this.decimalToString(value));
    if (!Number.isFinite(parsed)) return null;
    return parsed;
  }
}
export {
  PropertyService
};
