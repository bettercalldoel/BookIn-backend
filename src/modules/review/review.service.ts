import { PrismaClient } from "@prisma/client";
import { CreateReviewDTO } from "./dto/create-review.dto.js";

export class ReviewService {
  constructor(private prisma: PrismaClient) {}

  /* =========================
   * USER CREATE REVIEW
   * ========================= */
  createReview = async (
    bookingId: string,
    userId: string,
    dto: CreateReviewDTO,
  ) => {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });

    if (!booking) {
      throw new Error("Booking not found");
    }

    // Rule: only booking owner
    if (booking.userId !== userId) {
      throw new Error("Unauthorized");
    }

    // Rule: only after checkout
    if (booking.checkOut > new Date()) {
      throw new Error("Review can only be created after check-out");
    }

    return this.prisma.review.create({
      data: {
        bookingId,
        rating: dto.rating,
        comment: dto.comment,
      },
    });
  };

  /* =========================
   * TENANT REPLY
   * ========================= */
  replyReview = async (reviewId: string, reply: string) => {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
    });

    if (!review) {
      throw new Error("Review not found");
    }

    if (review.tenantReply) {
      throw new Error("Review already replied");
    }

    return this.prisma.review.update({
      where: { id: reviewId },
      data: {
        tenantReply: reply,
        tenantRepliedAt: new Date(),
      },
    });
  };
}
