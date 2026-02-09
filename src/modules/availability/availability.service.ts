import {
  AdjustmentType,
  Prisma,
  PrismaClient,
  RateScope,
} from "@prisma/client";
import { ApiError } from "../../utils/api-error.js";
import { UpdateRoomAvailabilityDTO } from "./dto/room-availability.dto.js";
import { RoomAvailabilityQueryDTO } from "./dto/room-availability-query.dto.js";
import { CreateRateRuleDTO } from "./dto/create-rate-rule.dto.js";
import { ListRateRuleQueryDTO } from "./dto/list-rate-rule-query.dto.js";
import { UpdateRateRuleDTO } from "./dto/update-rate-rule.dto.js";

const DATE_FORMAT_ERROR = "Tanggal harus berformat YYYY-MM-DD.";

export class AvailabilityService {
  constructor(private prisma: PrismaClient) {}

  listRoomCalendar = async (
    tenantAccountId: string,
    roomTypeId: string,
    query: RoomAvailabilityQueryDTO,
  ) => {
    const startDate = this.parseDate(query.startDate, "Tanggal mulai");
    const endDate = this.parseDate(query.endDate, "Tanggal akhir");
    if (endDate < startDate) {
      throw new ApiError("Tanggal akhir harus setelah tanggal mulai.", 400);
    }

    const roomType = await this.ensureRoomTypeOwner(
      tenantAccountId,
      roomTypeId,
    );
    const dates = this.buildDateRange(startDate, endDate);

    const calendarEntries = await this.prisma.roomTypeCalendar.findMany({
      where: {
        roomTypeId,
        date: { in: dates },
      },
    });

    const calendarMap = new Map(
      calendarEntries.map((entry) => [this.toDateKey(entry.date), entry]),
    );

    const rateRules = await this.prisma.rateRule.findMany({
      where: {
        tenantAccountId,
        isActive: true,
        OR: [
          { scope: RateScope.ROOM_TYPE, roomTypeId },
          { scope: RateScope.PROPERTY, propertyId: roomType.propertyId },
        ],
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
      orderBy: { startDate: "asc" },
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
        finalPrice: finalPrice.toString(),
      };
    });

    return {
      roomTypeId: roomType.id,
      propertyId: roomType.propertyId,
      totalUnits: roomType.totalUnits,
      items,
    };
  };

  listPublicRoomCalendar = async (
    roomTypeId: string,
    query: RoomAvailabilityQueryDTO,
  ) => {
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
        property: { select: { tenantAccountId: true } },
      },
    });

    if (!roomType) {
      throw new ApiError("Room tidak ditemukan.", 404);
    }

    const dates = this.buildDateRange(startDate, endDate);

    const calendarEntries = await this.prisma.roomTypeCalendar.findMany({
      where: {
        roomTypeId,
        date: { in: dates },
      },
    });

    const calendarMap = new Map(
      calendarEntries.map((entry) => [this.toDateKey(entry.date), entry]),
    );

    const rateRules = await this.prisma.rateRule.findMany({
      where: {
        tenantAccountId: roomType.property.tenantAccountId,
        isActive: true,
        OR: [
          { scope: RateScope.ROOM_TYPE, roomTypeId },
          { scope: RateScope.PROPERTY, propertyId: roomType.propertyId },
        ],
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
      orderBy: { startDate: "asc" },
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
        finalPrice: finalPrice.toString(),
      };
    });

    return {
      roomTypeId: roomType.id,
      propertyId: roomType.propertyId,
      totalUnits: roomType.totalUnits,
      items,
    };
  };

  updateRoomAvailability = async (
    tenantAccountId: string,
    roomTypeId: string,
    body: UpdateRoomAvailabilityDTO,
  ) => {
    const roomType = await this.ensureRoomTypeOwner(
      tenantAccountId,
      roomTypeId,
    );
    const dates = this.resolveDateList(body);

    if (dates.length === 0) {
      throw new ApiError("Tanggal tidak boleh kosong.", 400);
    }

    if (!body.isClosed && body.availableUnits !== undefined) {
      if (body.availableUnits <= 0) {
        throw new ApiError("Jumlah unit harus lebih dari 0.", 400);
      }
    }

    if (!body.isClosed && body.closeUnits !== undefined) {
      throw new ApiError(
        "Jumlah unit yang ditutup hanya boleh diisi saat aksi tutup room.",
        400,
      );
    }

    if (
      body.availableUnits !== undefined &&
      body.availableUnits > roomType.totalUnits
    ) {
      throw new ApiError("Jumlah unit melebihi total unit room.", 400);
    }

    const existingEntries = await this.prisma.roomTypeCalendar.findMany({
      where: { roomTypeId, date: { in: dates } },
    });

    const existingMap = new Map(
      existingEntries.map((entry) => [this.toDateKey(entry.date), entry]),
    );

    const updates = dates.map((date) => {
      const key = this.toDateKey(date);
      const existing = existingMap.get(key);
      const currentAvailableUnits =
        existing?.availableUnits ?? roomType.totalUnits;
      let isClosed = body.isClosed;
      let availableUnits: number;

      if (body.isClosed) {
        if (body.closeUnits !== undefined) {
          if (body.closeUnits > currentAvailableUnits) {
            throw new ApiError(
              `Jumlah room yang ditutup pada tanggal ${key} melebihi stok tersedia (${currentAvailableUnits} unit).`,
              400,
            );
          }

          availableUnits = currentAvailableUnits - body.closeUnits;
          isClosed = availableUnits === 0;
        } else {
          availableUnits = 0;
          isClosed = true;
        }
      } else {
        availableUnits =
          body.availableUnits ??
          existing?.availableUnits ??
          roomType.totalUnits;
        isClosed = false;
      }

      const price = existing?.price ?? roomType.basePrice;

      return this.prisma.roomTypeCalendar.upsert({
        where: {
          roomTypeId_date: {
            roomTypeId,
            date,
          },
        },
        update: {
          availableUnits,
          isClosed,
          price,
          updatedAt: new Date(),
        },
        create: {
          roomTypeId,
          date,
          availableUnits,
          isClosed,
          price,
        },
      });
    });

    await this.prisma.$transaction(updates);

    return {
      message: "Ketersediaan room berhasil diperbarui.",
      totalDates: dates.length,
    };
  };

  createRateRule = async (tenantAccountId: string, body: CreateRateRuleDTO) => {
    const name = body.name.trim();
    if (!name) throw new ApiError("Nama aturan wajib diisi.", 400);

    const { propertyId, roomTypeId } = await this.resolveScopeTarget(
      tenantAccountId,
      body.scope,
      body.propertyId,
      body.roomTypeId,
    );

    const dateRanges = this.resolveRateRuleDates(body);
    const adjustmentValue = this.parseAdjustmentValue(
      body.adjustmentValue,
      body.adjustmentType,
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
      isActive: body.isActive ?? true,
    }));

    if (payloads.length === 1) {
      const rule = await this.prisma.rateRule.create({ data: payloads[0] });
      return {
        message: "Aturan harga berhasil dibuat.",
        id: rule.id,
      };
    }

    await this.prisma.rateRule.createMany({ data: payloads });

    return {
      message: "Aturan harga berhasil dibuat.",
      totalRules: payloads.length,
    };
  };

  listRateRules = async (
    tenantAccountId: string,
    query: ListRateRuleQueryDTO,
  ) => {
    const where: {
      tenantAccountId: string;
      scope?: RateScope;
      propertyId?: string;
      roomTypeId?: string;
      isActive?: boolean;
    } = {
      tenantAccountId,
    };

    if (query.scope) where.scope = query.scope;
    if (query.propertyId) where.propertyId = query.propertyId;
    if (query.roomTypeId) where.roomTypeId = query.roomTypeId;
    if (query.isActive !== undefined) {
      where.isActive = query.isActive === "true";
    }

    const rules = await this.prisma.rateRule.findMany({
      where,
      orderBy: { startDate: "asc" },
    });

    return rules.map((rule) => ({
      id: rule.id,
      name: rule.name,
      scope: rule.scope,
      propertyId: rule.propertyId,
      roomTypeId: rule.roomTypeId,
      startDate: this.toDateKey(rule.startDate),
      endDate: this.toDateKey(rule.endDate),
      adjustmentType: rule.adjustmentType,
      adjustmentValue: rule.adjustmentValue.toString(),
      isActive: rule.isActive,
    }));
  };

  updateRateRule = async (
    tenantAccountId: string,
    rateRuleId: string,
    body: UpdateRateRuleDTO,
  ) => {
    const existing = await this.prisma.rateRule.findFirst({
      where: { id: rateRuleId, tenantAccountId },
    });

    if (!existing) {
      throw new ApiError("Aturan harga tidak ditemukan.", 404);
    }

    const name = body.name?.trim();
    const startDate = body.startDate
      ? this.parseDate(body.startDate, "Tanggal mulai")
      : existing.startDate;
    const endDate = body.endDate
      ? this.parseDate(body.endDate, "Tanggal akhir")
      : existing.endDate;

    if (endDate < startDate) {
      throw new ApiError("Tanggal akhir harus setelah tanggal mulai.", 400);
    }

    const adjustmentType = body.adjustmentType ?? existing.adjustmentType;
    const adjustmentValue = body.adjustmentValue
      ? this.parseAdjustmentValue(body.adjustmentValue, adjustmentType)
      : existing.adjustmentValue;

    await this.prisma.rateRule.update({
      where: { id: rateRuleId },
      data: {
        name: name ?? existing.name,
        startDate,
        endDate,
        adjustmentType,
        value: adjustmentValue,
        adjustmentValue,
        isActive: body.isActive ?? existing.isActive,
      },
    });

    return {
      message: "Aturan harga berhasil diperbarui.",
      id: rateRuleId,
    };
  };

  deleteRateRule = async (tenantAccountId: string, rateRuleId: string) => {
    const existing = await this.prisma.rateRule.findFirst({
      where: { id: rateRuleId, tenantAccountId },
      select: { id: true },
    });

    if (!existing) {
      throw new ApiError("Aturan harga tidak ditemukan.", 404);
    }

    await this.prisma.rateRule.delete({ where: { id: rateRuleId } });

    return {
      message: "Aturan harga berhasil dihapus.",
      id: rateRuleId,
    };
  };

  private async ensureRoomTypeOwner(
    tenantAccountId: string,
    roomTypeId: string,
  ) {
    const roomType = await this.prisma.roomType.findFirst({
      where: {
        id: roomTypeId,
        property: { tenantAccountId },
      },
      select: {
        id: true,
        propertyId: true,
        totalUnits: true,
        basePrice: true,
      },
    });

    if (!roomType) {
      throw new ApiError("Room tidak ditemukan.", 404);
    }

    return roomType;
  }

  private async ensurePropertyOwner(
    tenantAccountId: string,
    propertyId: string,
  ) {
    const property = await this.prisma.property.findFirst({
      where: {
        id: propertyId,
        tenantAccountId,
      },
      select: { id: true },
    });

    if (!property) {
      throw new ApiError("Properti tidak ditemukan.", 404);
    }

    return property;
  }

  private resolveDateList(body: UpdateRoomAvailabilityDTO) {
    if (body.dates && body.dates.length > 0) {
      return this.parseDateList(body.dates);
    }

    if (!body.startDate || !body.endDate) {
      throw new ApiError("Tanggal mulai dan akhir wajib diisi.", 400);
    }

    const start = this.parseDate(body.startDate, "Tanggal mulai");
    const end = this.parseDate(body.endDate, "Tanggal akhir");
    if (end < start) {
      throw new ApiError("Tanggal akhir harus setelah tanggal mulai.", 400);
    }
    return this.buildDateRange(start, end);
  }

  private resolveRateRuleDates(body: CreateRateRuleDTO) {
    if (body.dates && body.dates.length > 0) {
      const dates = this.parseDateList(body.dates);
      return dates.map((date) => ({ startDate: date, endDate: date }));
    }

    if (!body.startDate || !body.endDate) {
      throw new ApiError("Tanggal mulai dan akhir wajib diisi.", 400);
    }

    const startDate = this.parseDate(body.startDate, "Tanggal mulai");
    const endDate = this.parseDate(body.endDate, "Tanggal akhir");

    if (endDate < startDate) {
      throw new ApiError("Tanggal akhir harus setelah tanggal mulai.", 400);
    }

    return [{ startDate, endDate }];
  }

  private async resolveScopeTarget(
    tenantAccountId: string,
    scope: RateScope,
    propertyId?: string,
    roomTypeId?: string,
  ) {
    if (scope === RateScope.PROPERTY) {
      if (!propertyId) {
        throw new ApiError("Properti wajib dipilih.", 400);
      }
      if (roomTypeId) {
        throw new ApiError(
          "Room type tidak digunakan untuk scope properti.",
          400,
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
      roomTypeId,
    );
    return { propertyId: null, roomTypeId: roomType.id };
  }

  private parseAdjustmentValue(value: string, adjustmentType: AdjustmentType) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new ApiError("Nilai penyesuaian tidak valid.", 400);
    }

    if (adjustmentType === AdjustmentType.PERCENT && parsed > 1000) {
      throw new ApiError("Persentase terlalu besar.", 400);
    }

    return new Prisma.Decimal(value);
  }

  private calculateAdjustment(
    basePrice: Prisma.Decimal,
    rules: {
      adjustmentType: AdjustmentType;
      adjustmentValue: Prisma.Decimal;
      startDate: Date;
      endDate: Date;
    }[],
    date: Date,
  ) {
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

  private parseDate(value: string, label: string) {
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

  private parseDateList(values: string[]) {
    const unique = new Map<string, Date>();

    values.forEach((value) => {
      const date = this.parseDate(value, "Tanggal");
      unique.set(this.toDateKey(date), date);
    });

    return Array.from(unique.values()).sort(
      (a, b) => a.getTime() - b.getTime(),
    );
  }

  private buildDateRange(startDate: Date, endDate: Date) {
    const dates: Date[] = [];
    const cursor = new Date(startDate.getTime());

    while (cursor.getTime() <= endDate.getTime()) {
      dates.push(new Date(cursor.getTime()));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return dates;
  }

  private toDateKey(date: Date) {
    return date.toISOString().slice(0, 10);
  }
}
