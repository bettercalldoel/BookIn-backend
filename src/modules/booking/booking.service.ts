import crypto from "crypto";
import {
  AdjustmentType,
  CancelledBy,
  OrderStatus,
  PaymentMethod,
  PaymentProofStatus,
  Prisma,
  PrismaClient,
  RateScope,
} from "@prisma/client";
import { ApiError } from "../../utils/api-error.js";
import {
  APP_BASE_URL,
  XENDIT_CALLBACK_TOKEN,
  XENDIT_SECRET_KEY,
} from "../../config/env.js";
import { uploadImageBuffer } from "../../lib/cloudinary.js";
import { sendBookingReceiptEmail } from "../../lib/mailer.js";
import { createXenditInvoice, getXenditInvoiceById } from "../../lib/xendit.js";
import { CreateBookingDTO } from "./dto/create-booking.dto.js";
import { ListTenantPaymentProofDTO } from "./dto/list-tenant-payment-proof.dto.js";
import { ListBookingDTO } from "./dto/list-booking.dto.js";
import { ReviewPaymentProofDTO } from "./dto/review-payment-proof.dto.js";
import { CreateReviewDTO } from "./dto/create-review.dto.js";
import { ReplyReviewDTO } from "./dto/reply-review.dto.js";
import { ListTenantReviewDTO } from "./dto/list-tenant-review.dto.js";

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

type XenditInvoiceWebhookPayload = {
  id?: unknown;
  external_id?: unknown;
  status?: unknown;
  paid_at?: unknown;
};

const DATE_FORMAT_ERROR = "Tanggal harus berformat YYYY-MM-DD.";
const PAYMENT_PROOF_UPLOAD_TTL_MINUTES = 30;

export class BookingService {
  constructor(private prisma: PrismaClient) {}

  create = async (userId: string, dto: CreateBookingDTO) => {
    const paymentMethod = dto.paymentMethod ?? PaymentMethod.MANUAL_TRANSFER;

    const result = await this.prisma.$transaction(async (tx) => {
      const quote = await this.buildQuote(tx, dto);
      const paymentDueAt = new Date(
        Date.now() + PAYMENT_PROOF_UPLOAD_TTL_MINUTES * 60 * 1000,
      );

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
          paymentMethod,
          status: OrderStatus.MENUNGGU_PEMBAYARAN,
          paymentDueAt,
          proofDueAt:
            paymentMethod === PaymentMethod.MANUAL_TRANSFER
              ? paymentDueAt
              : null,
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
        paymentMethod,
      };
    });

    if (paymentMethod !== PaymentMethod.XENDIT) {
      return {
        message: "Booking berhasil dibuat.",
        ...result,
        xenditInvoiceUrl: null,
      };
    }

    const user = await this.prisma.account.findUnique({
      where: { id: userId },
      select: {
        email: true,
      },
    });

    if (!user) {
      await this.cancelPendingBookingBySystem(result.id);
      throw new ApiError("Akun user tidak ditemukan.", 404);
    }

    try {
      const invoice = await this.createGatewayInvoice({
        bookingId: result.id,
        orderNo: result.orderNo,
        amount: result.totalAmount,
        userEmail: user.email,
      });

      const updatedBooking = await this.prisma.booking.update({
        where: { id: result.id },
        data: {
          xenditInvoiceId: invoice.id,
          xenditInvoiceUrl: invoice.invoice_url,
          xenditInvoiceStatus: invoice.status,
          paymentDueAt:
            invoice.expiry_date &&
            !Number.isNaN(Date.parse(invoice.expiry_date))
              ? new Date(invoice.expiry_date)
              : result.paymentDueAt,
        },
        select: {
          paymentDueAt: true,
          xenditInvoiceUrl: true,
        },
      });

      return {
        message: "Booking berhasil dibuat.",
        ...result,
        paymentDueAt: updatedBooking.paymentDueAt,
        xenditInvoiceUrl: updatedBooking.xenditInvoiceUrl,
      };
    } catch (error) {
      await this.cancelPendingBookingBySystem(result.id);
      if (error instanceof ApiError) {
        throw error;
      }

      throw new ApiError("Gagal membuat invoice Xendit.", 502);
    }
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
    await this.autoCompleteFinishedBookings();
    await this.autoCancelExpiredUnpaidBookings();
    await this.syncPendingXenditBookings({ userId });

    const parsedPage = Number(dto.page);
    const parsedLimit = Number(dto.limit);
    const page =
      Number.isFinite(parsedPage) && parsedPage >= 1 ? parsedPage : 1;
    const limit =
      Number.isFinite(parsedLimit) && parsedLimit >= 1
        ? Math.min(parsedLimit, 100)
        : 10;

    const where: Prisma.BookingWhereInput = {
      userId,
      ...(dto.status ? { status: dto.status } : {}),
    };

    const orderNo = dto.orderNo?.trim();
    if (orderNo) {
      where.orderNo = { contains: orderNo, mode: "insensitive" };
    }

    const startDate = dto.startDate
      ? this.parseDate(dto.startDate, "Tanggal mulai")
      : null;
    const endDate = dto.endDate
      ? this.parseDate(dto.endDate, "Tanggal akhir")
      : null;

    if (startDate && endDate && endDate < startDate) {
      throw new ApiError("Tanggal akhir harus setelah tanggal mulai.", 400);
    }

    if (startDate || endDate) {
      where.createdAt = {
        ...(startDate ? { gte: this.startOfDayUTC(startDate) } : {}),
        ...(endDate ? { lte: this.endOfDayUTC(endDate) } : {}),
      };
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.booking.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          roomType: true,
          review: {
            select: {
              id: true,
              rating: true,
              comment: true,
              tenantReply: true,
              tenantRepliedAt: true,
              createdAt: true,
            },
          },
        },
      }),
      this.prisma.booking.count({ where }),
    ]);

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
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

  cancelByUser = async (
    userId: string,
    bookingId: string,
    cancelledBy: CancelledBy = CancelledBy.USER,
  ) => {
    if (cancelledBy !== CancelledBy.USER) {
      throw new ApiError("User hanya dapat membatalkan atas nama USER.", 400);
    }

    return this.prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        include: {
          paymentProofs: {
            where: {
              status: PaymentProofStatus.SUBMITTED,
            },
            select: { id: true },
            take: 1,
          },
          roomType: {
            select: {
              totalUnits: true,
              basePrice: true,
            },
          },
          nights: {
            select: {
              stayDate: true,
            },
          },
        },
      });

      if (!booking) {
        throw new ApiError("Booking tidak ditemukan.", 404);
      }

      if (booking.userId !== userId) {
        throw new ApiError("Forbidden.", 403);
      }

      if (booking.status !== OrderStatus.MENUNGGU_PEMBAYARAN) {
        throw new ApiError(
          "Booking hanya dapat dibatalkan sebelum upload bukti pembayaran.",
          400,
        );
      }

      if (booking.paymentProofs.length > 0) {
        throw new ApiError(
          "Booking tidak bisa dibatalkan karena bukti pembayaran sudah diunggah.",
          400,
        );
      }

      const cancelled = await this.cancelBookingWithInventoryRestore(
        tx,
        booking.id,
        CancelledBy.USER,
      );

      if (!cancelled) {
        throw new ApiError("Booking tidak dapat dibatalkan.", 400);
      }

      return {
        message: "Booking berhasil dibatalkan.",
        id: booking.id,
      };
    });
  };

  autoCancelExpiredUnpaidBookings = async () => {
    const now = new Date();

    const candidates = await this.prisma.booking.findMany({
      where: {
        status: OrderStatus.MENUNGGU_PEMBAYARAN,
        OR: [{ proofDueAt: { lte: now } }, { paymentDueAt: { lte: now } }],
        paymentProofs: {
          none: {
            status: PaymentProofStatus.SUBMITTED,
          },
        },
      },
      select: { id: true },
    });

    if (candidates.length === 0) {
      return { cancelled: 0 };
    }

    let cancelledCount = 0;

    await this.prisma.$transaction(async (tx) => {
      for (const candidate of candidates) {
        const cancelled = await this.cancelBookingWithInventoryRestore(
          tx,
          candidate.id,
          CancelledBy.SYSTEM,
        );
        if (cancelled) {
          cancelledCount += 1;
        }
      }
    });

    return { cancelled: cancelledCount };
  };

  autoCompleteFinishedBookings = async () => {
    const now = new Date();
    const result = await this.prisma.booking.updateMany({
      where: {
        status: OrderStatus.DIPROSES,
        checkOut: {
          lte: now,
        },
      },
      data: {
        status: OrderStatus.SELESAI,
      },
    });

    return { completed: result.count };
  };

  processXenditWebhook = async (
    callbackToken: string | undefined,
    payload: XenditInvoiceWebhookPayload,
  ) => {
    if (!XENDIT_CALLBACK_TOKEN) {
      throw new ApiError("Xendit callback token belum dikonfigurasi.", 500);
    }

    if (!callbackToken || callbackToken !== XENDIT_CALLBACK_TOKEN) {
      throw new ApiError("Invalid callback token.", 401);
    }

    const invoiceId = this.normalizeWebhookText(payload.id);
    const externalId = this.normalizeWebhookText(payload.external_id);
    const status =
      this.normalizeWebhookText(payload.status)?.toUpperCase() ?? "";
    const paidAt = this.parseWebhookDate(payload.paid_at);

    if (!invoiceId && !externalId) {
      throw new ApiError("Payload webhook Xendit tidak valid.", 400);
    }

    const whereOr: Prisma.BookingWhereInput[] = [];
    if (invoiceId) {
      whereOr.push({ xenditInvoiceId: invoiceId });
    }
    if (externalId) {
      whereOr.push({ id: externalId });
    }

    const booking = await this.prisma.booking.findFirst({
      where: {
        paymentMethod: PaymentMethod.XENDIT,
        OR: whereOr,
      },
      select: {
        id: true,
      },
    });

    if (!booking) {
      return {
        message: "Webhook Xendit diterima, booking tidak ditemukan.",
      };
    }

    await this.prisma.booking.update({
      where: { id: booking.id },
      data: {
        ...(invoiceId ? { xenditInvoiceId: invoiceId } : {}),
        ...(status ? { xenditInvoiceStatus: status } : {}),
      },
    });

    if (status === "PAID") {
      return this.confirmXenditBookingPayment(booking.id, paidAt ?? new Date());
    }

    if (status === "EXPIRED") {
      const cancelled = await this.prisma.$transaction((tx) =>
        this.cancelBookingWithInventoryRestore(
          tx,
          booking.id,
          CancelledBy.SYSTEM,
        ),
      );

      return {
        message: cancelled
          ? "Pembayaran Xendit kedaluwarsa, booking dibatalkan."
          : "Webhook Xendit diterima.",
        bookingId: booking.id,
        status,
      };
    }

    return {
      message: "Webhook Xendit diterima.",
      bookingId: booking.id,
      status: status || null,
    };
  };

  private syncPendingXenditBookings = async (
    scope: Pick<Prisma.BookingWhereInput, "userId" | "tenantId">,
  ) => {
    if (!XENDIT_SECRET_KEY) {
      return;
    }

    const pendingBookings = await this.prisma.booking.findMany({
      where: {
        ...scope,
        paymentMethod: PaymentMethod.XENDIT,
        status: OrderStatus.MENUNGGU_PEMBAYARAN,
        xenditInvoiceId: {
          not: null,
        },
      },
      select: {
        id: true,
        xenditInvoiceId: true,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 20,
    });

    for (const booking of pendingBookings) {
      const invoiceId = booking.xenditInvoiceId?.trim();
      if (!invoiceId) continue;

      try {
        const invoice = await getXenditInvoiceById(invoiceId);
        const invoiceStatus =
          this.normalizeWebhookText(invoice.status)?.toUpperCase() ?? null;
        const paidAt = this.parseWebhookDate(invoice.paid_at);

        await this.prisma.booking.update({
          where: { id: booking.id },
          data: {
            ...(invoiceStatus ? { xenditInvoiceStatus: invoiceStatus } : {}),
            ...(invoice.invoice_url
              ? { xenditInvoiceUrl: invoice.invoice_url }
              : {}),
          },
        });

        if (invoiceStatus === "PAID") {
          await this.confirmXenditBookingPayment(
            booking.id,
            paidAt ?? new Date(),
          );
          continue;
        }

        if (invoiceStatus === "EXPIRED") {
          await this.prisma.$transaction((tx) =>
            this.cancelBookingWithInventoryRestore(
              tx,
              booking.id,
              CancelledBy.SYSTEM,
            ),
          );
        }
      } catch (error) {
        console.error(
          `[BookingService] Failed to sync Xendit invoice status for booking ${booking.id}.`,
          error,
        );
      }
    }
  };

  uploadPaymentProof = async (
    userId: string,
    bookingId: string,
    file: Express.Multer.File,
  ) => {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        userId: true,
        status: true,
        paymentMethod: true,
        proofDueAt: true,
        paymentDueAt: true,
      },
    });

    if (!booking) {
      throw new ApiError("Booking tidak ditemukan.", 404);
    }

    if (booking.userId !== userId) {
      throw new ApiError("Forbidden.", 403);
    }

    if (booking.paymentMethod !== PaymentMethod.MANUAL_TRANSFER) {
      throw new ApiError(
        "Booking ini menggunakan pembayaran gateway. Selesaikan di halaman Xendit.",
        400,
      );
    }

    if (
      booking.status !== OrderStatus.MENUNGGU_PEMBAYARAN &&
      booking.status !== OrderStatus.MENUNGGU_KONFIRMASI_PEMBAYARAN
    ) {
      throw new ApiError(
        "Booking tidak dalam status yang bisa upload bukti pembayaran.",
        400,
      );
    }

    const proofDeadline = booking.proofDueAt ?? booking.paymentDueAt;
    if (proofDeadline && Date.now() > proofDeadline.getTime()) {
      throw new ApiError(
        "Batas waktu upload bukti pembayaran (30 menit) sudah berakhir.",
        400,
      );
    }

    const pendingProof = await this.prisma.paymentProof.findFirst({
      where: {
        bookingId,
        status: PaymentProofStatus.SUBMITTED,
      },
      select: { id: true },
    });

    if (pendingProof) {
      throw new ApiError(
        "Bukti pembayaran sudah dikirim dan menunggu konfirmasi tenant.",
        400,
      );
    }

    const uploadedImage = await uploadImageBuffer(file, {
      folder: `payment-proofs/${bookingId}`,
    });

    await this.prisma.$transaction([
      this.prisma.paymentProof.create({
        data: {
          bookingId,
          imageUrl: uploadedImage.secureUrl,
          status: PaymentProofStatus.SUBMITTED,
          method: PaymentMethod.MANUAL_TRANSFER,
        },
      }),
      this.prisma.booking.update({
        where: { id: bookingId },
        data: {
          status: OrderStatus.MENUNGGU_KONFIRMASI_PEMBAYARAN,
        },
      }),
    ]);

    return {
      message: "Bukti pembayaran berhasil diupload.",
      imageUrl: uploadedImage.secureUrl,
    };
  };

  listTenantPaymentProofs = async (
    tenantAccountId: string,
    dto: ListTenantPaymentProofDTO,
  ) => {
    await this.syncPendingXenditBookings({ tenantId: tenantAccountId });

    const status = dto.status ?? PaymentProofStatus.SUBMITTED;

    const proofs = await this.prisma.paymentProof.findMany({
      where: {
        status,
        booking: {
          tenantId: tenantAccountId,
        },
      },
      orderBy: {
        submittedAt: "desc",
      },
      include: {
        booking: {
          select: {
            id: true,
            orderNo: true,
            checkIn: true,
            checkOut: true,
            guests: true,
            rooms: true,
            totalAmount: true,
            status: true,
            property: {
              select: {
                id: true,
                name: true,
              },
            },
            roomType: {
              select: {
                id: true,
                name: true,
              },
            },
            user: {
              select: {
                id: true,
                email: true,
                userProfile: {
                  select: {
                    fullName: true,
                    phone: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    const mappedProofs = proofs.map((proof) => ({
      id: proof.id,
      bookingId: proof.bookingId,
      method: proof.method,
      status: proof.status,
      imageUrl: proof.imageUrl,
      submittedAt: proof.submittedAt,
      reviewedAt: proof.reviewedAt,
      reviewNotes: proof.reviewNotes,
      booking: {
        id: proof.booking.id,
        orderNo: proof.booking.orderNo,
        checkIn: proof.booking.checkIn,
        checkOut: proof.booking.checkOut,
        guests: proof.booking.guests,
        rooms: proof.booking.rooms,
        totalAmount: proof.booking.totalAmount.toString(),
        status: proof.booking.status,
        property: proof.booking.property,
        roomType: proof.booking.roomType,
      },
      user: {
        id: proof.booking.user.id,
        email: proof.booking.user.email,
        fullName: proof.booking.user.userProfile?.fullName ?? null,
        phone: proof.booking.user.userProfile?.phone ?? null,
      },
    }));

    // Tenant dashboard masih berbasis "payment proof", jadi booking Xendit
    // diproyeksikan sebagai item APPROVED agar tetap terlihat di order list.
    if (status !== PaymentProofStatus.APPROVED) {
      return mappedProofs;
    }

    const xenditBookings = await this.prisma.booking.findMany({
      where: {
        tenantId: tenantAccountId,
        paymentMethod: PaymentMethod.XENDIT,
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        orderNo: true,
        checkIn: true,
        checkOut: true,
        guests: true,
        rooms: true,
        totalAmount: true,
        status: true,
        createdAt: true,
        paymentConfirmedAt: true,
        xenditInvoiceUrl: true,
        xenditInvoiceStatus: true,
        property: {
          select: {
            id: true,
            name: true,
          },
        },
        roomType: {
          select: {
            id: true,
            name: true,
          },
        },
        user: {
          select: {
            id: true,
            email: true,
            userProfile: {
              select: {
                fullName: true,
                phone: true,
              },
            },
          },
        },
      },
    });

    const xenditVirtualProofs = xenditBookings.map((booking) => ({
      id: `xendit-${booking.id}`,
      bookingId: booking.id,
      method: PaymentMethod.XENDIT,
      status: PaymentProofStatus.APPROVED,
      imageUrl: booking.xenditInvoiceUrl ?? "",
      submittedAt: booking.createdAt,
      reviewedAt: booking.paymentConfirmedAt,
      reviewNotes: booking.xenditInvoiceStatus
        ? `Xendit status: ${booking.xenditInvoiceStatus}`
        : "Xendit status: PENDING",
      booking: {
        id: booking.id,
        orderNo: booking.orderNo,
        checkIn: booking.checkIn,
        checkOut: booking.checkOut,
        guests: booking.guests,
        rooms: booking.rooms,
        totalAmount: booking.totalAmount.toString(),
        status: booking.status,
        property: booking.property,
        roomType: booking.roomType,
      },
      user: {
        id: booking.user.id,
        email: booking.user.email,
        fullName: booking.user.userProfile?.fullName ?? null,
        phone: booking.user.userProfile?.phone ?? null,
      },
    }));

    return [...mappedProofs, ...xenditVirtualProofs];
  };

  approvePaymentProof = async (
    tenantAccountId: string,
    paymentProofId: string,
    dto: ReviewPaymentProofDTO,
  ) => {
    const proof = await this.getTenantProof(tenantAccountId, paymentProofId);

    if (proof.status !== PaymentProofStatus.SUBMITTED) {
      throw new ApiError("Bukti pembayaran sudah diproses.", 400);
    }

    const reviewNotes = this.normalizeReviewNotes(dto?.notes);
    const reviewedAt = new Date();

    const [updatedProof] = await this.prisma.$transaction([
      this.prisma.paymentProof.update({
        where: { id: paymentProofId },
        data: {
          status: PaymentProofStatus.APPROVED,
          reviewedAt,
          reviewNotes,
        },
      }),
      this.prisma.booking.update({
        where: { id: proof.bookingId },
        data: {
          status: OrderStatus.DIPROSES,
          paymentConfirmedAt: reviewedAt,
        },
      }),
    ]);

    let receiptEmailSent = false;
    try {
      await this.sendApprovedBookingReceiptEmail({
        bookingId: proof.bookingId,
        approvedAt: reviewedAt,
        paymentMethod: updatedProof.method,
        reviewNotes,
      });
      receiptEmailSent = true;
    } catch (error) {
      console.error(
        `[BookingService] Failed to send booking receipt email for booking ${proof.bookingId}.`,
        error,
      );
    }

    return {
      message: "Bukti pembayaran disetujui.",
      paymentProof: {
        id: updatedProof.id,
        status: updatedProof.status,
        reviewedAt: updatedProof.reviewedAt,
        reviewNotes: updatedProof.reviewNotes,
      },
      receiptEmailSent,
    };
  };

  rejectPaymentProof = async (
    tenantAccountId: string,
    paymentProofId: string,
    dto: ReviewPaymentProofDTO,
  ) => {
    const proof = await this.getTenantProof(tenantAccountId, paymentProofId);

    if (proof.status !== PaymentProofStatus.SUBMITTED) {
      throw new ApiError("Bukti pembayaran sudah diproses.", 400);
    }

    const reviewNotes = this.normalizeReviewNotes(dto?.notes);
    const reviewedAt = new Date();

    const [updatedProof] = await this.prisma.$transaction([
      this.prisma.paymentProof.update({
        where: { id: paymentProofId },
        data: {
          status: PaymentProofStatus.REJECTED,
          reviewedAt,
          reviewNotes,
        },
      }),
      this.prisma.booking.update({
        where: { id: proof.bookingId },
        data: {
          status: OrderStatus.MENUNGGU_PEMBAYARAN,
          paymentConfirmedAt: null,
        },
      }),
    ]);

    return {
      message: "Bukti pembayaran ditolak.",
      paymentProof: {
        id: updatedProof.id,
        status: updatedProof.status,
        reviewedAt: updatedProof.reviewedAt,
        reviewNotes: updatedProof.reviewNotes,
      },
    };
  };

  createReview = async (
    userId: string,
    bookingId: string,
    dto: CreateReviewDTO,
  ) => {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        review: {
          select: { id: true },
        },
      },
    });

    if (!booking) {
      throw new ApiError("Booking tidak ditemukan.", 404);
    }

    if (booking.userId !== userId) {
      throw new ApiError("Forbidden.", 403);
    }

    if (booking.review) {
      throw new ApiError(
        "Review untuk booking ini sudah pernah dikirim sebelumnya.",
        400,
      );
    }

    const now = new Date();
    if (now < booking.checkOut) {
      throw new ApiError(
        "Review hanya bisa dikirim setelah tanggal check-out.",
        400,
      );
    }

    if (booking.status !== OrderStatus.SELESAI) {
      if (booking.status === OrderStatus.DIPROSES) {
        await this.prisma.booking.update({
          where: { id: bookingId },
          data: {
            status: OrderStatus.SELESAI,
          },
        });
      } else {
        throw new ApiError(
          "Review hanya bisa diberikan saat booking sudah selesai.",
          400,
        );
      }
    }

    const comment = dto.comment.trim();
    if (!comment) {
      throw new ApiError("Komentar review wajib diisi.", 400);
    }

    const timestamp = new Date();
    let created: {
      id: string;
      bookingId: string;
      rating: number;
      comment: string;
      createdAt: Date;
    };

    try {
      created = await this.prisma.review.create({
        data: {
          bookingId,
          rating: dto.rating,
          comment,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
        select: {
          id: true,
          bookingId: true,
          rating: true,
          comment: true,
          createdAt: true,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2011"
      ) {
        const legacyRows = await this.prisma.$queryRaw<
          Array<{
            id: string;
            booking_id: string;
            rating: number;
            comment: string;
            created_at: Date;
          }>
        >`
          INSERT INTO reviews (
            booking_id,
            property_id,
            room_type_id,
            user_id,
            tenant_id,
            rating,
            comment,
            created_at,
            updated_at
          )
          VALUES (
            ${bookingId}::uuid,
            ${booking.propertyId}::uuid,
            ${booking.roomTypeId}::uuid,
            ${booking.userId}::uuid,
            ${booking.tenantId}::uuid,
            ${dto.rating},
            ${comment},
            ${timestamp},
            ${timestamp}
          )
          RETURNING id, booking_id, rating, comment, created_at
        `;

        const legacyCreated = legacyRows[0];
        if (!legacyCreated) {
          throw new ApiError("Gagal menyimpan review.", 500);
        }

        created = {
          id: legacyCreated.id,
          bookingId: legacyCreated.booking_id,
          rating: Number(legacyCreated.rating),
          comment: legacyCreated.comment,
          createdAt: legacyCreated.created_at,
        };
      } else {
        throw error;
      }
    }

    return {
      message: "Review berhasil dikirim.",
      review: created,
    };
  };

  listTenantReviews = async (
    tenantAccountId: string,
    dto: ListTenantReviewDTO,
  ) => {
    const parsedPage = Number(dto.page);
    const parsedLimit = Number(dto.limit);
    const page =
      Number.isFinite(parsedPage) && parsedPage >= 1 ? parsedPage : 1;
    const limit =
      Number.isFinite(parsedLimit) && parsedLimit >= 1
        ? Math.min(parsedLimit, 100)
        : 10;

    const repliedFilter = dto.replied;
    const where: Prisma.ReviewWhereInput = {
      booking: {
        tenantId: tenantAccountId,
      },
      ...(repliedFilter === "true"
        ? {
            tenantReply: {
              not: null,
            },
          }
        : {}),
      ...(repliedFilter === "false"
        ? {
            tenantReply: null,
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.review.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          booking: {
            select: {
              id: true,
              orderNo: true,
              checkIn: true,
              checkOut: true,
              property: {
                select: {
                  id: true,
                  name: true,
                },
              },
              user: {
                select: {
                  id: true,
                  email: true,
                  userProfile: {
                    select: {
                      fullName: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),
      this.prisma.review.count({ where }),
    ]);

    return {
      data: data.map((item) => ({
        id: item.id,
        bookingId: item.bookingId,
        rating: item.rating,
        comment: item.comment,
        tenantReply: item.tenantReply,
        tenantRepliedAt: item.tenantRepliedAt,
        createdAt: item.createdAt,
        booking: {
          id: item.booking.id,
          orderNo: item.booking.orderNo,
          checkIn: item.booking.checkIn,
          checkOut: item.booking.checkOut,
          property: item.booking.property,
        },
        user: {
          id: item.booking.user.id,
          email: item.booking.user.email,
          fullName: item.booking.user.userProfile?.fullName ?? null,
        },
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  };

  replyReview = async (
    tenantAccountId: string,
    reviewId: string,
    dto: ReplyReviewDTO,
  ) => {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
      include: {
        booking: {
          select: {
            tenantId: true,
          },
        },
      },
    });

    if (!review) {
      throw new ApiError("Review tidak ditemukan.", 404);
    }

    if (review.booking.tenantId !== tenantAccountId) {
      throw new ApiError("Forbidden.", 403);
    }

    const reply = dto.reply.trim();
    if (!reply) {
      throw new ApiError("Balasan review wajib diisi.", 400);
    }

    const updated = await this.prisma.review.update({
      where: { id: reviewId },
      data: {
        tenantReply: reply,
        tenantRepliedAt: new Date(),
      },
      select: {
        id: true,
        tenantReply: true,
        tenantRepliedAt: true,
      },
    });

    return {
      message: "Balasan review berhasil disimpan.",
      review: updated,
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

  private async cancelBookingWithInventoryRestore(
    tx: Prisma.TransactionClient,
    bookingId: string,
    cancelledBy: CancelledBy,
  ) {
    const booking = await tx.booking.findUnique({
      where: { id: bookingId },
      include: {
        paymentProofs: {
          where: {
            status: PaymentProofStatus.SUBMITTED,
          },
          select: { id: true },
          take: 1,
        },
        roomType: {
          select: {
            id: true,
            totalUnits: true,
            basePrice: true,
          },
        },
        nights: {
          select: {
            stayDate: true,
          },
        },
      },
    });

    if (!booking) return false;
    if (booking.status !== OrderStatus.MENUNGGU_PEMBAYARAN) return false;
    if (booking.paymentProofs.length > 0) return false;

    const cancelledResult = await tx.booking.updateMany({
      where: {
        id: booking.id,
        status: OrderStatus.MENUNGGU_PEMBAYARAN,
      },
      data: {
        status: OrderStatus.DIBATALKAN,
        cancelledBy,
        cancelledAt: new Date(),
      },
    });

    if (cancelledResult.count === 0) return false;

    await this.releaseRoomInventory(tx, {
      roomTypeId: booking.roomTypeId,
      roomTotalUnits: booking.roomType.totalUnits,
      roomBasePrice: booking.roomType.basePrice,
      rooms: booking.rooms,
      nights: booking.nights.map((night) => night.stayDate),
    });

    return true;
  }

  private async releaseRoomInventory(
    tx: Prisma.TransactionClient,
    payload: {
      roomTypeId: string;
      roomTotalUnits: number;
      roomBasePrice: Prisma.Decimal;
      rooms: number;
      nights: Date[];
    },
  ) {
    for (const stayDate of payload.nights) {
      const existing = await tx.roomTypeCalendar.findUnique({
        where: {
          roomTypeId_date: {
            roomTypeId: payload.roomTypeId,
            date: stayDate,
          },
        },
        select: {
          availableUnits: true,
          isClosed: true,
          price: true,
        },
      });

      const restoredUnits = existing
        ? Math.min(
            payload.roomTotalUnits,
            existing.availableUnits + payload.rooms,
          )
        : payload.roomTotalUnits;

      await tx.roomTypeCalendar.upsert({
        where: {
          roomTypeId_date: {
            roomTypeId: payload.roomTypeId,
            date: stayDate,
          },
        },
        update: {
          availableUnits: restoredUnits,
          isClosed: existing?.isClosed ?? false,
          price: existing?.price ?? payload.roomBasePrice,
          updatedAt: new Date(),
        },
        create: {
          roomTypeId: payload.roomTypeId,
          date: stayDate,
          availableUnits: restoredUnits,
          isClosed: false,
          price: payload.roomBasePrice,
        },
      });
    }
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

  private startOfDayUTC(date: Date) {
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
  }

  private endOfDayUTC(date: Date) {
    return new Date(
      Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
        23,
        59,
        59,
        999,
      ),
    );
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

  private async createGatewayInvoice(payload: {
    bookingId: string;
    orderNo: string;
    amount: string;
    userEmail: string;
  }) {
    const parsedAmount = Number(payload.amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      throw new ApiError("Total booking tidak valid.", 400);
    }

    const safeBaseUrl = APP_BASE_URL.replace(/\/$/, "");
    const successRedirectUrl = `${safeBaseUrl}/my-transaction?orderNo=${encodeURIComponent(payload.orderNo)}`;
    const failureRedirectUrl = `${safeBaseUrl}/payment?bookingId=${encodeURIComponent(payload.bookingId)}`;

    return createXenditInvoice({
      externalId: payload.bookingId,
      amount: parsedAmount,
      payerEmail: payload.userEmail,
      description: `Pembayaran booking ${payload.orderNo}`,
      successRedirectUrl,
      failureRedirectUrl,
    });
  }

  private async cancelPendingBookingBySystem(bookingId: string) {
    await this.prisma.$transaction((tx) =>
      this.cancelBookingWithInventoryRestore(tx, bookingId, CancelledBy.SYSTEM),
    );
  }

  private async confirmXenditBookingPayment(bookingId: string, paidAt: Date) {
    const updated = await this.prisma.booking.updateMany({
      where: {
        id: bookingId,
        paymentMethod: PaymentMethod.XENDIT,
        status: OrderStatus.MENUNGGU_PEMBAYARAN,
        paymentConfirmedAt: null,
      },
      data: {
        status: OrderStatus.DIPROSES,
        paymentConfirmedAt: paidAt,
        xenditInvoiceStatus: "PAID",
      },
    });

    if (updated.count === 0) {
      return {
        message: "Webhook Xendit diterima.",
        bookingId,
        confirmed: false,
      };
    }

    let receiptEmailSent = false;
    try {
      await this.sendApprovedBookingReceiptEmail({
        bookingId,
        approvedAt: paidAt,
        paymentMethod: PaymentMethod.XENDIT,
        reviewNotes: null,
      });
      receiptEmailSent = true;
    } catch (error) {
      console.error(
        `[BookingService] Failed to send Xendit booking receipt email for booking ${bookingId}.`,
        error,
      );
    }

    return {
      message: "Pembayaran Xendit berhasil dikonfirmasi otomatis.",
      bookingId,
      confirmed: true,
      receiptEmailSent,
    };
  }

  private normalizeWebhookText(value: unknown) {
    if (typeof value !== "string") return null;
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private parseWebhookDate(value: unknown) {
    if (typeof value !== "string") return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
  }

  private async sendApprovedBookingReceiptEmail(payload: {
    bookingId: string;
    approvedAt: Date;
    paymentMethod: PaymentMethod;
    reviewNotes: string | null;
  }) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: payload.bookingId },
      select: {
        orderNo: true,
        checkIn: true,
        checkOut: true,
        guests: true,
        rooms: true,
        totalAmount: true,
        createdAt: true,
        user: {
          select: {
            email: true,
            userProfile: {
              select: {
                fullName: true,
              },
            },
          },
        },
        tenant: {
          select: {
            email: true,
            tenantProfile: {
              select: {
                displayName: true,
              },
            },
          },
        },
        property: {
          select: {
            name: true,
          },
        },
        roomType: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!booking) {
      console.warn(
        `[BookingService] Booking ${payload.bookingId} not found while preparing receipt email.`,
      );
      return;
    }

    await sendBookingReceiptEmail({
      to: booking.user.email,
      userName: booking.user.userProfile?.fullName ?? booking.user.email,
      orderNo: booking.orderNo,
      propertyName: booking.property.name,
      roomTypeName: booking.roomType.name,
      checkIn: booking.checkIn,
      checkOut: booking.checkOut,
      guests: booking.guests,
      rooms: booking.rooms,
      totalAmount: booking.totalAmount.toString(),
      paymentMethod: payload.paymentMethod,
      approvedAt: payload.approvedAt,
      bookingCreatedAt: booking.createdAt,
      tenantName:
        booking.tenant.tenantProfile?.displayName ?? booking.tenant.email,
      reviewNotes: payload.reviewNotes,
    });
  }

  private async getTenantProof(
    tenantAccountId: string,
    paymentProofId: string,
  ) {
    const proof = await this.prisma.paymentProof.findUnique({
      where: { id: paymentProofId },
      select: {
        id: true,
        bookingId: true,
        status: true,
        booking: {
          select: {
            tenantId: true,
          },
        },
      },
    });

    if (!proof) {
      throw new ApiError("Bukti pembayaran tidak ditemukan.", 404);
    }

    if (proof.booking.tenantId !== tenantAccountId) {
      throw new ApiError("Forbidden.", 403);
    }

    return proof;
  }

  private normalizeReviewNotes(notes?: string) {
    const clean = notes?.trim();
    return clean ? clean : null;
  }
}
