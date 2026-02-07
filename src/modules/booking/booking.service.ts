import crypto from "crypto";
import {
  AdjustmentType,
  CancelledBy,
  OrderStatus,
  PaymentProofStatus,
  Prisma,
  PrismaClient,
  RateScope,
  PaymentMethod,
} from "@prisma/client";
import { ApiError } from "../../utils/api-error.js";
import { CreateBookingDTO } from "./dto/create-booking.dto.js";
import { ListBookingDTO } from "./dto/list-booking.dto.js";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import path from "path";

type DbClient = PrismaClient | Prisma.TransactionClient;

type NightQuote = {
  date: Date;
  dateKey: string;
  availableUnits: number;
  isClosed: boolean;
  basePrice: Prisma.Decimal;
  adjustment: Prisma.Decimal;
  pricePerNight: Prisma.Decimal;
  existingPrice: Prisma.Decimal | null;
};

type BookingQuote = {
  roomTypeId: string;
  propertyId: string;
  tenantAccountId: string;
  checkIn: Date;
  checkOut: Date;
  rooms: number;
  guests: number;
  nights: NightQuote[];
  baseTotal: Prisma.Decimal;
  adjustmentTotal: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
};

const DATE_FORMAT_ERROR = "Tanggal harus berformat YYYY-MM-DD.";
const PAYMENT_DUE_HOURS = 2;

export class BookingService {
  constructor(
    private prisma: PrismaClient,
    private s3: S3Client,
  ) {}

  create = async (userId: string, dto: CreateBookingDTO) => {
    const result = await this.prisma.$transaction(async (tx) => {
      const quote = await this.buildQuote(tx, dto);

      const booking = await tx.booking.create({
        data: {
          orderNo: this.generateOrderNo(),
          roomType: { connect: { id: quote.roomTypeId } },
          property: { connect: { id: quote.propertyId } },
          user: { connect: { id: userId } },
          tenant: { connect: { id: quote.tenantAccountId } },
          checkIn: quote.checkIn,
          checkOut: quote.checkOut,
          guests: dto.guests,
          rooms: quote.rooms,
          baseTotal: quote.baseTotal,
          adjustmentTotal: quote.adjustmentTotal,
          totalAmount: quote.totalAmount,
          status: OrderStatus.MENUNGGU_PEMBAYARAN,
          paymentDueAt: new Date(Date.now() + PAYMENT_DUE_HOURS * 3600 * 1000),
        },
      });

      await tx.bookingNight.createMany({
        data: quote.nights.map((night) => ({
          bookingId: booking.id,
          stayDate: night.date,
          basePrice: night.basePrice,
          adjustmentAmount: night.adjustment,
          finalPrice: night.pricePerNight,
        })),
      });

      await Promise.all(
        quote.nights.map((night) => {
          const nextUnits = night.availableUnits - quote.rooms;
          if (nextUnits < 0) {
            throw new ApiError("Stok room tidak mencukupi.", 400);
          }

          return tx.roomTypeCalendar.upsert({
            where: {
              roomTypeId_date: {
                roomTypeId: quote.roomTypeId,
                date: night.date,
              },
            },
            update: {
              availableUnits: nextUnits,
              isClosed: night.isClosed,
              price: night.existingPrice ?? night.basePrice,
              updatedAt: new Date(),
            },
            create: {
              roomTypeId: quote.roomTypeId,
              date: night.date,
              availableUnits: nextUnits,
              isClosed: night.isClosed,
              price: night.basePrice,
            },
          });
        }),
      );

      return {
        id: booking.id,
        orderNo: booking.orderNo,
        totalAmount: quote.totalAmount.toString(),
        paymentDueAt: booking.paymentDueAt,
      };
    });

    return {
      message: "Booking berhasil dibuat.",
      ...result,
    };
  };

  preview = async (_userId: string, dto: CreateBookingDTO) => {
    const quote = await this.buildQuote(this.prisma, dto);

    return {
      roomTypeId: quote.roomTypeId,
      propertyId: quote.propertyId,
      checkIn: this.toDateKey(quote.checkIn),
      checkOut: this.toDateKey(quote.checkOut),
      rooms: quote.rooms,
      guests: quote.guests,
      totalNights: quote.nights.length,
      totalAmount: quote.totalAmount.toString(),
      nights: quote.nights.map((night) => ({
        date: night.dateKey,
        basePrice: night.basePrice.toString(),
        adjustment: night.adjustment.toString(),
        finalPrice: night.pricePerNight.toString(),
        availableUnits: night.availableUnits,
        isClosed: night.isClosed,
      })),
    };
  };

  list = async (userId: string, dto: ListBookingDTO) => {
    const where = {
      user: {
        id: userId,
      },
      ...(dto.status ? { status: dto.status } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.booking.findMany({
        where,
        skip: (dto.page - 1) * dto.limit,
        take: dto.limit,
        orderBy: { createdAt: "desc" },
        include: {
          roomType: true,
        },
      }),
      this.prisma.booking.count({ where }),
    ]);

    return {
      data,
      meta: {
        page: dto.page,
        limit: dto.limit,
        total,
        totalPages: Math.ceil(total / dto.limit),
      },
    };
  };

  listOptions = async () => {
    const properties = await this.prisma.property.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        city: {
          select: {
            name: true,
            provinceName: true,
            province: { select: { name: true } },
          },
        },
        roomTypes: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    return properties.map((property) => ({
      id: property.id,
      name: property.name,
      address: property.address,
      city: property.city?.name ?? null,
      province:
        property.city?.province?.name ?? property.city?.provinceName ?? null,
      roomTypes: property.roomTypes.map((room) => ({
        id: room.id,
        name: room.name,
        basePrice: room.basePrice.toString(),
        totalUnits: room.totalUnits,
        maxGuests: room.maxGuests,
      })),
    }));
  };

  cancel = async (bookingId: string, cancelledBy: CancelledBy) => {
    return this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: OrderStatus.DIBATALKAN,
        cancelledBy,
        cancelledAt: new Date(),
      },
    });
  };

  uploadPaymentProof = async (bookingId: string, file: Express.Multer.File) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const fileName = `payment-proofs/${bookingId}/${Date.now()}${ext}`;

    await this.s3.send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME,
        Key: fileName,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );
    const fileUrl = `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.S3_REGION}.amazonaws.com/${fileName}`;

    await this.prisma.paymentProof.create({
      data: {
        bookingId,
        imageUrl: fileUrl,
        status: PaymentProofStatus.SUBMITTED,
        method: PaymentMethod.MANUAL_TRANSFER,
      },
    });
    return {
      message: "Payment proof uploaded successfully.",
      imageUrl: fileUrl,
    };
  };

  private async buildQuote(client: DbClient, dto: CreateBookingDTO) {
    const checkIn = this.parseDate(dto.checkIn, "Check-in");
    const checkOut = this.parseDate(dto.checkOut, "Check-out");

    if (checkOut.getTime() <= checkIn.getTime()) {
      throw new ApiError("Check-out harus setelah check-in.", 400);
    }

    const roomType = await client.roomType.findUnique({
      where: { id: dto.roomTypeId },
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

    if (roomType.propertyId !== dto.propertyId) {
      throw new ApiError("Properti tidak sesuai dengan room.", 400);
    }

    const nights = this.buildStayDates(checkIn, checkOut);
    if (nights.length === 0) {
      throw new ApiError("Tanggal booking tidak valid.", 400);
    }

    const lastNight = nights[nights.length - 1];

    const rateRules = await client.rateRule.findMany({
      where: {
        tenantAccountId: roomType.property.tenantAccountId,
        isActive: true,
        OR: [
          { scope: RateScope.ROOM_TYPE, roomTypeId: roomType.id },
          { scope: RateScope.PROPERTY, propertyId: roomType.propertyId },
        ],
        startDate: { lte: lastNight },
        endDate: { gte: checkIn },
      },
      orderBy: { startDate: "asc" },
    });

    const calendarEntries = await client.roomTypeCalendar.findMany({
      where: {
        roomTypeId: roomType.id,
        date: { in: nights },
      },
    });

    const calendarMap = new Map(
      calendarEntries.map((entry) => [this.toDateKey(entry.date), entry]),
    );

    const basePrice = new Prisma.Decimal(roomType.basePrice);
    const quoteNights: NightQuote[] = [];
    let baseTotal = new Prisma.Decimal(0);
    let adjustmentTotal = new Prisma.Decimal(0);
    let totalAmount = new Prisma.Decimal(0);

    nights.forEach((date) => {
      const dateKey = this.toDateKey(date);
      const entry = calendarMap.get(dateKey);
      const isClosed = entry?.isClosed ?? false;
      const availableUnits = entry?.availableUnits ?? roomType.totalUnits;

      if (isClosed) {
        throw new ApiError(`Room tidak tersedia pada tanggal ${dateKey}.`, 400);
      }

      if (availableUnits < dto.rooms) {
        throw new ApiError(
          `Stok room tidak mencukupi pada tanggal ${dateKey}.`,
          400,
        );
      }

      const adjustment = this.calculateAdjustment(basePrice, rateRules, date);
      const pricePerNight = basePrice.add(adjustment);
      const roomsCount = new Prisma.Decimal(dto.rooms);
      baseTotal = baseTotal.add(basePrice.mul(roomsCount));
      adjustmentTotal = adjustmentTotal.add(adjustment.mul(roomsCount));
      totalAmount = totalAmount.add(pricePerNight.mul(roomsCount));

      quoteNights.push({
        date,
        dateKey,
        availableUnits,
        isClosed,
        basePrice,
        adjustment,
        pricePerNight,
        existingPrice: entry?.price ?? null,
      });
    });

    return {
      roomTypeId: roomType.id,
      propertyId: roomType.propertyId,
      tenantAccountId: roomType.property.tenantAccountId,
      checkIn,
      checkOut,
      rooms: dto.rooms,
      guests: dto.guests,
      nights: quoteNights,
      baseTotal,
      adjustmentTotal,
      totalAmount,
    } satisfies BookingQuote;
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
      const time = date.getTime();
      if (time < rule.startDate.getTime()) return total;
      if (time > rule.endDate.getTime()) return total;

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

  private buildStayDates(checkIn: Date, checkOut: Date) {
    const dates: Date[] = [];
    const cursor = new Date(checkIn.getTime());

    while (cursor.getTime() < checkOut.getTime()) {
      dates.push(new Date(cursor.getTime()));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return dates;
  }

  private toDateKey(date: Date) {
    return date.toISOString().slice(0, 10);
  }

  private generateOrderNo() {
    return `ORD-${Date.now()}-${crypto.randomInt(1000, 9999)}`;
  }
}
