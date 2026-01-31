import prisma from "../prisma/client.js";
import { OrderStatus, CancelledBy } from "@prisma/client";
import { CreateBookingDTO } from "./dto/create-booking.dto.js";
import { ListBookingDTO } from "./dto/list-booking.dto.js";

export class BookingService {
  /* =========================
   * CREATE BOOKING
   * ========================= */
  static async create(userId: string, dto: CreateBookingDTO) {
    const checkIn = new Date(dto.checkIn);
    const checkOut = new Date(dto.checkOut);

    if (checkOut <= checkIn) {
      throw new Error("Check-out date must be after check-in date");
    }

    const nights =
      (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24);

    const PRICE_PER_NIGHT = 500_000;
    const totalAmount = nights * PRICE_PER_NIGHT * dto.rooms;

    return prisma.booking.create({
      data: {
        orderNo: `ORD-${Date.now()}`,

        user: {
          connect: { id: userId },
        },
        roomType: {
          connect: { id: dto.roomTypeId },
        },

        checkIn,
        checkOut,
        guests: dto.guests,
        units: dto.rooms,

        totalAmount,
        status: OrderStatus.MENUNGGU_PEMBAYARAN,
        paymentDueAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
      },
    });
  }

  /* =========================
   * LIST BOOKINGS
   * ========================= */
  static async list(userId: string, dto: ListBookingDTO) {
    const where = {
      user: {
        id: userId,
      },
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

  /* =========================
   * CANCEL BOOKING
   * ========================= */
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
