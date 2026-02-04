import prisma from "../prisma/client.js";
import { CancelledBy, OrderStatus } from "@prisma/client";
import { CreateBookingDTO } from "./dto/create-booking.dto.js";
import { ListBookingDTO } from "./dto/list-booking.dto.js";

export class BookingService {
  static async create(userId: string, dto: CreateBookingDTO) {
    // 1️⃣ Parse and validate dates
    const checkIn = new Date(dto.checkIn);
    const checkOut = new Date(dto.checkOut);

    if (checkOut <= checkIn) {
      throw new Error("Check-out date must be after check-in date");
    }

    // 2️⃣ Calculate nights
    const nights =
      (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24);

    if (nights <= 0) {
      throw new Error("Invalid booking duration");
    }

    // 3️⃣ Pricing logic
    const PRICE_PER_NIGHT = 500_000;
    const totalAmount = nights * PRICE_PER_NIGHT * dto.rooms;

    // 4️⃣ Create booking (MATCHES SCHEMA)
    return prisma.booking.create({
      data: {
        orderNo: `ORD-${Date.now()}`,

        // ✅ relations that ACTUALLY EXIST
        user: {
          connect: { id: userId },
        },
        roomType: {
          connect: { id: dto.roomTypeId },
        },

        // booking info
        checkIn,
        checkOut,
        guests: dto.guests,
        units: dto.rooms, // or `rooms` depending on schema

        // payment
        totalAmount,
        status: OrderStatus.MENUNGGU_PEMBAYARAN,
        paymentDueAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
      },
    });
  }

  static async list(userId: string, dto: ListBookingDTO) {
    const where = {
      user: {
        id: userId,
      },
      ...(dto.status ? { status: dto.status } : {}),
    };

    const [data, total] = await prisma.$transaction([
      prisma.booking.findMany({
        where,
        skip: (dto.page - 1) * dto.limit,
        take: dto.limit,
        orderBy: { createdAt: "desc" },
        include: {
          roomType: true,
        },
      }),
      prisma.booking.count({ where }),
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
  }

  static async cancel(bookingId: string, cancelledBy: CancelledBy) {
    return prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: OrderStatus.DIBATALKAN,
        cancelledBy,
        cancelledAt: new Date(),
      },
    });
  }
}
