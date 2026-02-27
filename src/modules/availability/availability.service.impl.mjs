import {
  AdjustmentType,
  OrderStatus,
  Prisma,
  RateScope
} from "@prisma/client";
import { ApiError } from "../../utils/api-error.js";
const DATE_FORMAT_ERROR = "Tanggal harus berformat YYYY-MM-DD.";
class AvailabilityService {
  constructor(prisma) {
    this.prisma = prisma;
  }
  listRoomCalendar = async (tenantAccountId, roomTypeId, query) => {
    const startDate = this.parseDate(query.startDate, "Tanggal mulai");
    const endDate = this.parseDate(query.endDate, "Tanggal akhir");
    if (endDate < startDate) {
      throw new ApiError("Tanggal akhir harus setelah tanggal mulai.", 400);
    }
    const roomType = await this.ensureRoomTypeOwner(
      tenantAccountId,
      roomTypeId
    );
    const dates = this.buildDateRange(startDate, endDate);
    const calendarEntries = await this.prisma.roomTypeCalendar.findMany({
      where: {
        roomTypeId,
        date: { in: dates }
      }
    });
    const calendarMap = new Map(
      calendarEntries.map((entry) => [this.toDateKey(entry.date), entry])
    );
    const rateRules = await this.prisma.rateRule.findMany({
      where: {
        tenantAccountId,
        isActive: true,
        OR: [
          { scope: RateScope.ROOM_TYPE, roomTypeId },
          { scope: RateScope.PROPERTY, propertyId: roomType.propertyId }
        ],
        startDate: { lte: endDate },
        endDate: { gte: startDate }
      },
      orderBy: { startDate: "asc" }
    });
    const basePrice = new Prisma.Decimal(roomType.basePrice);
    const items = dates.map((date) => {
      const dateKey = this.toDateKey(date);
      const existing = calendarMap.get(dateKey);
      const adjustment = this.calculateAdjustment(basePrice, rateRules, date);
      const finalPrice = basePrice.add(adjustment);
      return {
        date: dateKey,
        availableUnits: existing?.availableUnits ?? roomType.totalUnits,
        isClosed: existing?.isClosed ?? false,
        basePrice: basePrice.toString(),
        adjustment: adjustment.toString(),
        finalPrice: finalPrice.toString()
      };
    });
    return {
      roomTypeId: roomType.id,
      propertyId: roomType.propertyId,
      totalUnits: roomType.totalUnits,
      items
    };
  };
  listPublicRoomCalendar = async (roomTypeId, query) => {
    const startDate = this.parseDate(query.startDate, "Tanggal mulai");
    const endDate = this.parseDate(query.endDate, "Tanggal akhir");
    if (endDate < startDate) {
      throw new ApiError("Tanggal akhir harus setelah tanggal mulai.", 400);
    }
    const roomType = await this.prisma.roomType.findUnique({
      where: { id: roomTypeId },
      select: {
        id: true,
        propertyId: true,
        totalUnits: true,
        basePrice: true,
        property: { select: { tenantAccountId: true } }
      }
    });
    if (!roomType) {
      throw new ApiError("Room tidak ditemukan.", 404);
    }
    const dates = this.buildDateRange(startDate, endDate);
    const calendarEntries = await this.prisma.roomTypeCalendar.findMany({
      where: {
        roomTypeId,
        date: { in: dates }
      }
    });
    const calendarMap = new Map(
      calendarEntries.map((entry) => [this.toDateKey(entry.date), entry])
    );
    const rateRules = await this.prisma.rateRule.findMany({
      where: {
        tenantAccountId: roomType.property.tenantAccountId,
        isActive: true,
        OR: [
          { scope: RateScope.ROOM_TYPE, roomTypeId },
          { scope: RateScope.PROPERTY, propertyId: roomType.propertyId }
        ],
        startDate: { lte: endDate },
        endDate: { gte: startDate }
      },
      orderBy: { startDate: "asc" }
    });
    const basePrice = new Prisma.Decimal(roomType.basePrice);
    const items = dates.map((date) => {
      const dateKey = this.toDateKey(date);
      const existing = calendarMap.get(dateKey);
      const adjustment = this.calculateAdjustment(basePrice, rateRules, date);
      const finalPrice = basePrice.add(adjustment);
      return {
        date: dateKey,
        availableUnits: existing?.availableUnits ?? roomType.totalUnits,
        isClosed: existing?.isClosed ?? false,
        basePrice: basePrice.toString(),
        adjustment: adjustment.toString(),
        finalPrice: finalPrice.toString()
      };
    });
    return {
      roomTypeId: roomType.id,
      propertyId: roomType.propertyId,
      totalUnits: roomType.totalUnits,
      items
    };
  };
  updateRoomAvailability = async (tenantAccountId, roomTypeId, body) => {
    const roomType = await this.ensureRoomTypeOwner(
      tenantAccountId,
      roomTypeId
    );
    const dates = this.resolveDateList(body);
    if (dates.length === 0) {
      throw new ApiError("Tanggal tidak boleh kosong.", 400);
    }
    const paidBookingSummaryByDate = body.isClosed || !body.isClosed && body.availableUnits !== void 0 ? await this.getPaidBookingSummaryByDate(roomTypeId, dates) : /* @__PURE__ */ new Map();
    if (body.isClosed) {
      this.ensureNoPaidBookingsOnDates(paidBookingSummaryByDate);
    }
    if (!body.isClosed && body.availableUnits !== void 0) {
      if (body.availableUnits <= 0) {
        throw new ApiError("Jumlah unit harus lebih dari 0.", 400);
      }
    }
    if (!body.isClosed && body.closeUnits !== void 0) {
      throw new ApiError(
        "Jumlah unit yang ditutup hanya boleh diisi saat aksi tutup room.",
        400
      );
    }
    if (body.availableUnits !== void 0 && body.availableUnits > roomType.totalUnits) {
      throw new ApiError("Jumlah unit melebihi total unit room.", 400);
    }
    if (!body.isClosed && body.availableUnits !== void 0) {
      this.ensureAvailableUnitsNotBelowPaidRooms(
        body.availableUnits,
        paidBookingSummaryByDate
      );
    }
    const existingEntries = await this.prisma.roomTypeCalendar.findMany({
      where: { roomTypeId, date: { in: dates } }
    });
    const existingMap = new Map(
      existingEntries.map((entry) => [this.toDateKey(entry.date), entry])
    );
    const updates = dates.map((date) => {
      const key = this.toDateKey(date);
      const existing = existingMap.get(key);
      const currentAvailableUnits = existing?.availableUnits ?? roomType.totalUnits;
      let isClosed = body.isClosed;
      let availableUnits;
      if (body.isClosed) {
        if (body.closeUnits !== void 0) {
          if (body.closeUnits > currentAvailableUnits) {
            throw new ApiError(
              `Jumlah room yang ditutup pada tanggal ${key} melebihi stok tersedia (${currentAvailableUnits} unit).`,
              400
            );
          }
          availableUnits = currentAvailableUnits - body.closeUnits;
          isClosed = availableUnits === 0;
        } else {
          availableUnits = 0;
          isClosed = true;
        }
      } else {
        availableUnits = body.availableUnits ?? existing?.availableUnits ?? roomType.totalUnits;
        isClosed = false;
      }
      const price = existing?.price ?? roomType.basePrice;
      return this.prisma.roomTypeCalendar.upsert({
        where: {
          roomTypeId_date: {
            roomTypeId,
            date
          }
        },
        update: {
          availableUnits,
          isClosed,
          price,
          updatedAt: /* @__PURE__ */ new Date()
        },
        create: {
          roomTypeId,
          date,
          availableUnits,
          isClosed,
          price
        }
      });
    });
    await this.prisma.$transaction(updates);
    return {
      message: "Ketersediaan room berhasil diperbarui.",
      totalDates: dates.length
    };
  };
  ensureNoPaidBookingsOnDates(paidBookingSummaryByDate) {
    if (paidBookingSummaryByDate.size === 0) {
      return;
    }
    const summary = Array.from(paidBookingSummaryByDate.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([date, payload]) => {
      const orders = Array.from(payload.orderNos);
      const preview = orders.slice(0, 2).join(", ");
      const tail = orders.length > 2 ? ` +${orders.length - 2} lainnya` : "";
      return `${date} (${preview}${tail})`;
    }).join(", ");
    throw new ApiError(
      `Tanggal ${summary} tidak bisa ditutup karena sudah ada transaksi terbayar.`,
      400
    );
  }
  ensureAvailableUnitsNotBelowPaidRooms(requestedAvailableUnits, paidBookingSummaryByDate) {
    if (paidBookingSummaryByDate.size === 0) {
      return;
    }
    const conflicts = Array.from(paidBookingSummaryByDate.entries()).filter(([, payload]) => requestedAvailableUnits < payload.soldRooms).sort(([a], [b]) => a.localeCompare(b));
    if (conflicts.length === 0) {
      return;
    }
    const summary = conflicts.map(([date, payload]) => {
      const orders = Array.from(payload.orderNos);
      const preview = orders.slice(0, 2).join(", ");
      const tail = orders.length > 2 ? ` +${orders.length - 2} lainnya` : "";
      return `${date} (${payload.soldRooms} terjual; ${preview}${tail})`;
    }).join(", ");
    throw new ApiError(
      `Jumlah unit tersedia (${requestedAvailableUnits}) tidak boleh lebih kecil dari kamar terjual pada tanggal ${summary}.`,
      400
    );
  }
  async getPaidBookingSummaryByDate(roomTypeId, dates) {
    const conflictMap = /* @__PURE__ */ new Map();
    const paidBookingNights = await this.fetchPaidBookingNights(roomTypeId, dates);
    paidBookingNights.forEach(
      (item) => this.addPaidNightSummary(conflictMap, item)
    );
    return conflictMap;
  }
  fetchPaidBookingNights(roomTypeId, dates) {
    return this.prisma.bookingNight.findMany({
      where: {
        stayDate: { in: dates },
        booking: { roomTypeId, status: { in: [OrderStatus.DIPROSES, OrderStatus.SELESAI] } }
      },
      select: { stayDate: true, booking: { select: { orderNo: true, rooms: true } } }
    });
  }
  addPaidNightSummary(conflictMap, item) {
    const dateKey = this.toDateKey(item.stayDate);
    const current = conflictMap.get(dateKey) ?? { soldRooms: 0, orderNos: /* @__PURE__ */ new Set() };
    current.soldRooms += item.booking.rooms;
    current.orderNos.add(item.booking.orderNo);
    conflictMap.set(dateKey, current);
  }
  createRateRule = async (tenantAccountId, body) => {
    const name = body.name.trim();
    if (!name) throw new ApiError("Nama aturan wajib diisi.", 400);
    const { propertyId, roomTypeId } = await this.resolveScopeTarget(
      tenantAccountId,
      body.scope,
      body.propertyId,
      body.roomTypeId
    );
    const dateRanges = this.resolveRateRuleDates(body);
    const adjustmentValue = this.parseAdjustmentValue(
      body.adjustmentValue,
      body.adjustmentType
    );
    const payloads = dateRanges.map(({ startDate, endDate }) => ({
      tenantId: tenantAccountId,
      tenantAccountId,
      scope: body.scope,
      propertyId,
      roomTypeId,
      name,
      startDate,
      endDate,
      adjustmentType: body.adjustmentType,
      value: adjustmentValue,
      adjustmentValue,
      isActive: body.isActive ?? true
    }));
    if (payloads.length === 1) {
      const rule = await this.prisma.rateRule.create({ data: payloads[0] });
      return {
        message: "Aturan harga berhasil dibuat.",
        id: rule.id
      };
    }
    await this.prisma.rateRule.createMany({ data: payloads });
    return {
      message: "Aturan harga berhasil dibuat.",
      totalRules: payloads.length
    };
  };
  listRateRules = async (tenantAccountId, query) => {
    const parsedPage = Number(query.page);
    const parsedLimit = Number(query.limit);
    const page = Number.isFinite(parsedPage) && parsedPage >= 1 ? parsedPage : 1;
    const limit = Number.isFinite(parsedLimit) && parsedLimit >= 1 ? Math.min(parsedLimit, 100) : 20;
    const skip = (page - 1) * limit;
    const keyword = query.keyword?.trim() ?? "";
    const sortBy = query.sortBy ?? "startDate";
    const sortOrder = query.sortOrder === "desc" ? "desc" : "asc";
    const where = {
      tenantAccountId
    };
    if (query.scope) where.scope = query.scope;
    if (query.propertyId) where.propertyId = query.propertyId;
    if (query.roomTypeId) where.roomTypeId = query.roomTypeId;
    if (query.isActive !== void 0) {
      where.isActive = query.isActive === "true";
    }
    if (keyword) {
      where.name = { contains: keyword, mode: "insensitive" };
    }
    const [rules, total] = await this.prisma.$transaction([
      this.prisma.rateRule.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ [sortBy]: sortOrder }, { id: sortOrder }]
      }),
      this.prisma.rateRule.count({ where })
    ]);
    const totalPages = Math.max(1, Math.ceil(total / limit));
    return {
      data: rules.map((rule) => ({
        id: rule.id,
        name: rule.name,
        scope: rule.scope,
        propertyId: rule.propertyId,
        roomTypeId: rule.roomTypeId,
        startDate: this.toDateKey(rule.startDate),
        endDate: this.toDateKey(rule.endDate),
        adjustmentType: rule.adjustmentType,
        adjustmentValue: rule.adjustmentValue.toString(),
        isActive: rule.isActive
      })),
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
        scope: query.scope ?? null,
        propertyId: query.propertyId ?? null,
        roomTypeId: query.roomTypeId ?? null,
        isActive: query.isActive === void 0 ? null : query.isActive === "true",
        keyword: keyword || null,
        sortBy,
        sortOrder
      }
    };
  };
  updateRateRule = async (tenantAccountId, rateRuleId, body) => {
    const existing = await this.prisma.rateRule.findFirst({
      where: { id: rateRuleId, tenantAccountId }
    });
    if (!existing) {
      throw new ApiError("Aturan harga tidak ditemukan.", 404);
    }
    const name = body.name?.trim();
    const startDate = body.startDate ? this.parseDate(body.startDate, "Tanggal mulai") : existing.startDate;
    const endDate = body.endDate ? this.parseDate(body.endDate, "Tanggal akhir") : existing.endDate;
    if (endDate < startDate) {
      throw new ApiError("Tanggal akhir harus setelah tanggal mulai.", 400);
    }
    const adjustmentType = body.adjustmentType ?? existing.adjustmentType;
    const adjustmentValue = body.adjustmentValue ? this.parseAdjustmentValue(body.adjustmentValue, adjustmentType) : existing.adjustmentValue;
    await this.prisma.rateRule.update({
      where: { id: rateRuleId },
      data: {
        name: name ?? existing.name,
        startDate,
        endDate,
        adjustmentType,
        value: adjustmentValue,
        adjustmentValue,
        isActive: body.isActive ?? existing.isActive
      }
    });
    return {
      message: "Aturan harga berhasil diperbarui.",
      id: rateRuleId
    };
  };
  deleteRateRule = async (tenantAccountId, rateRuleId) => {
    const existing = await this.prisma.rateRule.findFirst({
      where: { id: rateRuleId, tenantAccountId },
      select: { id: true }
    });
    if (!existing) {
      throw new ApiError("Aturan harga tidak ditemukan.", 404);
    }
    await this.prisma.rateRule.delete({ where: { id: rateRuleId } });
    return {
      message: "Aturan harga berhasil dihapus.",
      id: rateRuleId
    };
  };
  async ensureRoomTypeOwner(tenantAccountId, roomTypeId) {
    const roomType = await this.prisma.roomType.findFirst({
      where: {
        id: roomTypeId,
        property: { tenantAccountId }
      },
      select: {
        id: true,
        propertyId: true,
        totalUnits: true,
        basePrice: true
      }
    });
    if (!roomType) {
      throw new ApiError("Room tidak ditemukan.", 404);
    }
    return roomType;
  }
  async ensurePropertyOwner(tenantAccountId, propertyId) {
    const property = await this.prisma.property.findFirst({
      where: {
        id: propertyId,
        tenantAccountId
      },
      select: { id: true }
    });
    if (!property) {
      throw new ApiError("Properti tidak ditemukan.", 404);
    }
    return property;
  }
  resolveDateList(body) {
    if (body.dates && body.dates.length > 0) return this.parseDateList(body.dates);
    const range = this.parseRequiredDateRange(body.startDate, body.endDate);
    return this.buildDateRange(range.startDate, range.endDate);
  }
  resolveRateRuleDates(body) {
    if (body.dates && body.dates.length > 0) return this.mapDatesToSingleDayRanges(body.dates);
    return [this.parseRequiredDateRange(body.startDate, body.endDate)];
  }
  mapDatesToSingleDayRanges(dates) {
    return this.parseDateList(dates).map((date) => ({ startDate: date, endDate: date }));
  }
  parseRequiredDateRange(startDateRaw, endDateRaw) {
    if (!startDateRaw || !endDateRaw) throw new ApiError("Tanggal mulai dan akhir wajib diisi.", 400);
    const startDate = this.parseDate(startDateRaw, "Tanggal mulai");
    const endDate = this.parseDate(endDateRaw, "Tanggal akhir");
    if (endDate < startDate) throw new ApiError("Tanggal akhir harus setelah tanggal mulai.", 400);
    return { startDate, endDate };
  }
  async resolveScopeTarget(tenantAccountId, scope, propertyId, roomTypeId) {
    if (scope === RateScope.PROPERTY) {
      if (!propertyId) {
        throw new ApiError("Properti wajib dipilih.", 400);
      }
      if (roomTypeId) {
        throw new ApiError(
          "Room type tidak digunakan untuk scope properti.",
          400
        );
      }
      await this.ensurePropertyOwner(tenantAccountId, propertyId);
      return { propertyId, roomTypeId: null };
    }
    if (!roomTypeId) {
      throw new ApiError("Room type wajib dipilih.", 400);
    }
    if (propertyId) {
      throw new ApiError("Properti tidak digunakan untuk scope room.", 400);
    }
    const roomType = await this.ensureRoomTypeOwner(
      tenantAccountId,
      roomTypeId
    );
    return { propertyId: null, roomTypeId: roomType.id };
  }
  parseAdjustmentValue(value, adjustmentType) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new ApiError("Nilai penyesuaian tidak valid.", 400);
    }
    if (adjustmentType === AdjustmentType.PERCENT && parsed > 1e3) {
      throw new ApiError("Persentase terlalu besar.", 400);
    }
    return new Prisma.Decimal(value);
  }
  calculateAdjustment(basePrice, rules, date) {
    return rules.reduce((total, rule) => {
      const dateTime = date.getTime();
      if (dateTime < rule.startDate.getTime()) return total;
      if (dateTime > rule.endDate.getTime()) return total;
      if (rule.adjustmentType === AdjustmentType.PERCENT) {
        return total.add(basePrice.mul(rule.adjustmentValue).div(100));
      }
      return total.add(rule.adjustmentValue);
    }, new Prisma.Decimal(0));
  }
  parseDate(value, label) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new ApiError(`${label} ${DATE_FORMAT_ERROR}`, 400);
    }
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (Number.isNaN(date.getTime())) {
      throw new ApiError(`${label} tidak valid.`, 400);
    }
    return date;
  }
  parseDateList(values) {
    const unique = /* @__PURE__ */ new Map();
    values.forEach((value) => {
      const date = this.parseDate(value, "Tanggal");
      unique.set(this.toDateKey(date), date);
    });
    return Array.from(unique.values()).sort(
      (a, b) => a.getTime() - b.getTime()
    );
  }
  buildDateRange(startDate, endDate) {
    const dates = [];
    const cursor = new Date(startDate.getTime());
    while (cursor.getTime() <= endDate.getTime()) {
      dates.push(new Date(cursor.getTime()));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return dates;
  }
  toDateKey(date) {
    return date.toISOString().slice(0, 10);
  }
}
export {
  AvailabilityService
};
