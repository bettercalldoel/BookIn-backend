import prisma from "../prisma/client.js";
import { OrderStatus } from "@prisma/client";
import { CreateBookingDTO } from "./dto/create-booking.dto.js";

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
}
