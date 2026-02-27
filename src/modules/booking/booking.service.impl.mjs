import crypto from "crypto";
import {
  AdjustmentType,
  CancelledBy,
  OrderStatus,
  PaymentMethod,
  PaymentProofStatus,
  Prisma,
  RateScope
} from "@prisma/client";
import { ApiError } from "../../utils/api-error.js";
import {
  APP_BASE_URL,
  BOOKING_PAYMENT_DUE_MINUTES,
  BOOKING_PROOF_UPLOAD_DUE_MINUTES,
  XENDIT_CALLBACK_TOKEN,
  XENDIT_SECRET_KEY
} from "../../config/env.js";
import { uploadImageBuffer } from "../../lib/cloudinary.js";
import {
  sendBookingCancelledByTenantEmail,
  sendBookingReceiptEmail,
  sendCheckInReminderEmail
} from "../../lib/mailer.js";
import { createXenditInvoice, getXenditInvoiceById } from "../../lib/xendit.js";
const DATE_FORMAT_ERROR = "Tanggal harus berformat YYYY-MM-DD.";
const DEFAULT_BOOKING_PAYMENT_DUE_MINUTES = 120;
const DEFAULT_BOOKING_PROOF_UPLOAD_DUE_MINUTES = 60;
const PRICING_CURRENCY = "IDR";
const APP_FEE_RATE = new Prisma.Decimal("0.02");
const TAX_RATE = new Prisma.Decimal("0.11");
const TENANT_FEE_RATE = new Prisma.Decimal("0.05");
const TENANT_CANCELLED_BOOKING_EMAIL_SELECT = {
  orderNo: true,
  checkIn: true,
  checkOut: true,
  guests: true,
  rooms: true,
  totalAmount: true,
  cancelledAt: true,
  user: {
    select: {
      email: true,
      userProfile: { select: { fullName: true } }
    }
  },
  tenant: {
    select: {
      email: true,
      tenantProfile: { select: { displayName: true } }
    }
  },
  property: { select: { name: true } },
  roomType: { select: { name: true } }
};
const BOOKING_QUOTE_ROOM_TYPE_SELECT = {
  id: true,
  propertyId: true,
  totalUnits: true,
  basePrice: true,
  property: {
    select: {
      tenantAccountId: true,
      breakfastEnabled: true,
      breakfastPricePerPax: true,
      breakfastCurrency: true
    }
  }
};
class BookingService {
  constructor(prisma) {
    this.prisma = prisma;
  }
  create = async (userId, dto) => {
    const paymentMethod = dto.paymentMethod ?? PaymentMethod.MANUAL_TRANSFER;
    const paymentDueMinutes = this.resolveBookingPaymentDueMinutes();
    const proofDueMinutes = this.resolveBookingProofUploadDueMinutes();
    const result = await this.prisma.$transaction(async (tx) => {
      await this.lockUserBookingCreation(tx, userId);
      const existingPending = await this.findDuplicatePendingBooking(tx, {
        userId,
        dto,
        paymentMethod
      });
      if (existingPending) {
        return {
          reusedExisting: true,
          id: existingPending.id,
          orderNo: existingPending.orderNo,
          totalAmount: existingPending.totalAmount.toString(),
          pricing: this.serializePricingFromStoredBooking(existingPending),
          paymentDueAt: existingPending.paymentDueAt,
          paymentMethod: existingPending.paymentMethod,
          xenditInvoiceUrl: existingPending.xenditInvoiceUrl
        };
      }
      const quote = await this.buildQuote(tx, dto);
      const paymentDueAt = new Date(Date.now() + paymentDueMinutes * 60 * 1e3);
      const proofDueAt = new Date(Date.now() + proofDueMinutes * 60 * 1e3);
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
          roomSubtotal: quote.pricing.roomSubtotal,
          breakfastSelected: quote.pricing.breakfastSelected,
          breakfastPax: quote.pricing.breakfastPax,
          breakfastUnitPrice: quote.pricing.breakfastUnitPrice,
          breakfastNights: quote.pricing.breakfastNights,
          breakfastTotal: quote.pricing.breakfastTotal,
          subtotalAmount: quote.pricing.subtotalAmount,
          appFeeRate: quote.pricing.appFeeRate,
          appFeeAmount: quote.pricing.appFeeAmount,
          taxRate: quote.pricing.taxRate,
          taxAmount: quote.pricing.taxAmount,
          tenantFeeRate: quote.pricing.tenantFeeRate,
          tenantFeeAmount: quote.pricing.tenantFeeAmount,
          tenantPayoutAmount: quote.pricing.tenantPayoutAmount,
          currency: quote.pricing.currency,
          pricingVersion: 1,
          totalAmount: quote.pricing.totalAmount,
          paymentMethod,
          status: OrderStatus.MENUNGGU_PEMBAYARAN,
          paymentDueAt,
          proofDueAt: paymentMethod === PaymentMethod.MANUAL_TRANSFER ? proofDueAt : null
        }
      });
      await tx.bookingNight.createMany({
        data: quote.nights.map((night) => ({
          bookingId: booking.id,
          stayDate: night.date,
          basePrice: night.basePrice,
          adjustmentAmount: night.adjustment,
          finalPrice: night.pricePerNight
        }))
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
                date: night.date
              }
            },
            update: {
              availableUnits: nextUnits,
              isClosed: night.isClosed,
              price: night.existingPrice ?? night.basePrice,
              updatedAt: /* @__PURE__ */ new Date()
            },
            create: {
              roomTypeId: quote.roomTypeId,
              date: night.date,
              availableUnits: nextUnits,
              isClosed: night.isClosed,
              price: night.basePrice
            }
          });
        })
      );
      return {
        reusedExisting: false,
        id: booking.id,
        orderNo: booking.orderNo,
        totalAmount: quote.pricing.totalAmount.toString(),
        pricing: this.serializePricing(quote.pricing),
        paymentDueAt: booking.paymentDueAt,
        paymentMethod: booking.paymentMethod
      };
    });
    if (result.reusedExisting) {
      return {
        message: "Booking aktif dengan detail yang sama sudah tersedia. Lanjutkan pembayaran pada order yang sama.",
        id: result.id,
        orderNo: result.orderNo,
        totalAmount: result.totalAmount,
        pricing: result.pricing,
        paymentDueAt: result.paymentDueAt,
        paymentMethod: result.paymentMethod,
        xenditInvoiceUrl: result.xenditInvoiceUrl ?? null,
        reusedExisting: true
      };
    }
    if (result.paymentMethod !== PaymentMethod.XENDIT) {
      return {
        message: "Booking berhasil dibuat.",
        ...result,
        xenditInvoiceUrl: null,
        reusedExisting: false
      };
    }
    const user = await this.prisma.account.findUnique({
      where: { id: userId },
      select: {
        email: true
      }
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
        userEmail: user.email
      });
      const updatedBooking = await this.prisma.booking.update({
        where: { id: result.id },
        data: {
          xenditInvoiceId: invoice.id,
          xenditInvoiceUrl: invoice.invoice_url,
          xenditInvoiceStatus: invoice.status,
          paymentDueAt: invoice.expiry_date && !Number.isNaN(Date.parse(invoice.expiry_date)) ? new Date(invoice.expiry_date) : result.paymentDueAt
        },
        select: {
          paymentDueAt: true,
          xenditInvoiceUrl: true
        }
      });
      return {
        message: "Booking berhasil dibuat.",
        ...result,
        paymentDueAt: updatedBooking.paymentDueAt,
        xenditInvoiceUrl: updatedBooking.xenditInvoiceUrl,
        reusedExisting: false
      };
    } catch (error) {
      await this.cancelPendingBookingBySystem(result.id);
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError("Gagal membuat invoice Xendit.", 502);
    }
  };
  async lockUserBookingCreation(tx, userId) {
    await tx.$queryRaw`
      SELECT id
      FROM accounts
      WHERE id = ${userId}::uuid
      FOR UPDATE
    `;
  }
  async findDuplicatePendingBooking(tx, payload) {
    const checkIn = this.parseDate(payload.dto.checkIn, "Check-in");
    const checkOut = this.parseDate(payload.dto.checkOut, "Check-out");
    const breakfastSelected = Boolean(payload.dto.breakfastSelected);
    const breakfastPax = breakfastSelected ? payload.dto.breakfastPax ?? payload.dto.guests : 0;
    const now = /* @__PURE__ */ new Date();
    return tx.booking.findFirst({
      where: {
        userId: payload.userId,
        propertyId: payload.dto.propertyId,
        roomTypeId: payload.dto.roomTypeId,
        checkIn,
        checkOut,
        guests: payload.dto.guests,
        rooms: payload.dto.rooms,
        paymentMethod: payload.paymentMethod,
        status: OrderStatus.MENUNGGU_PEMBAYARAN,
        breakfastSelected,
        breakfastPax,
        paymentDueAt: { gt: now },
        ...payload.paymentMethod === PaymentMethod.MANUAL_TRANSFER ? { proofDueAt: { gt: now } } : {}
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        orderNo: true,
        paymentMethod: true,
        paymentDueAt: true,
        proofDueAt: true,
        totalAmount: true,
        xenditInvoiceUrl: true,
        currency: true,
        roomSubtotal: true,
        breakfastSelected: true,
        breakfastPax: true,
        breakfastUnitPrice: true,
        breakfastNights: true,
        breakfastTotal: true,
        subtotalAmount: true,
        appFeeRate: true,
        appFeeAmount: true,
        taxRate: true,
        taxAmount: true,
        tenantFeeRate: true,
        tenantFeeAmount: true,
        tenantPayoutAmount: true
      }
    });
  }
  serializePricingFromStoredBooking(booking) {
    return this.serializePricing(this.toPricingBreakdownFromStoredBooking(booking));
  }
  toPricingBreakdownFromStoredBooking(booking) {
    return {
      currency: booking.currency,
      roomSubtotal: booking.roomSubtotal,
      breakfastSelected: booking.breakfastSelected,
      breakfastPax: booking.breakfastPax,
      breakfastUnitPrice: booking.breakfastUnitPrice,
      breakfastNights: booking.breakfastNights,
      breakfastTotal: booking.breakfastTotal,
      subtotalAmount: booking.subtotalAmount,
      appFeeRate: booking.appFeeRate,
      appFeeAmount: booking.appFeeAmount,
      taxRate: booking.taxRate,
      taxAmount: booking.taxAmount,
      tenantFeeRate: booking.tenantFeeRate,
      tenantFeeAmount: booking.tenantFeeAmount,
      tenantPayoutAmount: booking.tenantPayoutAmount,
      totalAmount: booking.totalAmount
    };
  }
  preview = async (_userId, dto) => {
    const quote = await this.buildQuote(this.prisma, dto);
    return {
      roomTypeId: quote.roomTypeId,
      propertyId: quote.propertyId,
      checkIn: this.toDateKey(quote.checkIn),
      checkOut: this.toDateKey(quote.checkOut),
      rooms: quote.rooms,
      guests: quote.guests,
      totalNights: quote.nights.length,
      totalAmount: quote.pricing.totalAmount.toString(),
      pricing: this.serializePricing(quote.pricing),
      nights: quote.nights.map((night) => ({
        date: night.dateKey,
        basePrice: night.basePrice.toString(),
        adjustment: night.adjustment.toString(),
        finalPrice: night.pricePerNight.toString(),
        availableUnits: night.availableUnits,
        isClosed: night.isClosed
      }))
    };
  };
  list = async (userId, dto) => {
    await this.autoCompleteFinishedBookings();
    await this.syncPendingXenditBookings({ userId });
    await this.autoCancelExpiredUnpaidBookings();
    const parsedPage = Number(dto.page);
    const parsedLimit = Number(dto.limit);
    const page = Number.isFinite(parsedPage) && parsedPage >= 1 ? parsedPage : 1;
    const limit = Number.isFinite(parsedLimit) && parsedLimit >= 1 ? Math.min(parsedLimit, 100) : 10;
    const sortBy = dto.sortBy ?? "createdAt";
    const sortOrder = dto.sortOrder === "asc" ? "asc" : "desc";
    const where = {
      userId,
      ...dto.status ? { status: dto.status } : {}
    };
    if (typeof dto.reviewed === "boolean") {
      where.review = dto.reviewed ? { isNot: null } : { is: null };
    }
    const orderNo = dto.orderNo?.trim();
    if (orderNo) {
      where.orderNo = { contains: orderNo, mode: "insensitive" };
    }
    const startDate = dto.startDate ? this.parseDate(dto.startDate, "Tanggal mulai") : null;
    const endDate = dto.endDate ? this.parseDate(dto.endDate, "Tanggal akhir") : null;
    if (startDate && endDate && endDate < startDate) {
      throw new ApiError("Tanggal akhir harus setelah tanggal mulai.", 400);
    }
    if (startDate || endDate) {
      where.createdAt = {
        ...startDate ? { gte: this.startOfDayUTC(startDate) } : {},
        ...endDate ? { lte: this.endOfDayUTC(endDate) } : {}
      };
    }
    let primaryOrderBy;
    switch (sortBy) {
      case "checkIn":
        primaryOrderBy = { checkIn: sortOrder };
        break;
      case "totalAmount":
        primaryOrderBy = { totalAmount: sortOrder };
        break;
      case "orderNo":
        primaryOrderBy = { orderNo: sortOrder };
        break;
      case "createdAt":
      default:
        primaryOrderBy = { createdAt: sortOrder };
        break;
    }
    const [data, total] = await this.prisma.$transaction([
      this.prisma.booking.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [primaryOrderBy, { id: "desc" }],
        include: {
          roomType: true,
          review: {
            select: {
              id: true,
              rating: true,
              comment: true,
              tenantReply: true,
              tenantRepliedAt: true,
              createdAt: true
            }
          }
        }
      }),
      this.prisma.booking.count({ where })
    ]);
    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        sortBy,
        sortOrder
      }
    };
  };
  listOptions = async (dto) => {
    const parsedPage = Number(dto.page);
    const parsedLimit = Number(dto.limit);
    const page = Number.isFinite(parsedPage) && parsedPage >= 1 ? parsedPage : 1;
    const limit = Number.isFinite(parsedLimit) && parsedLimit >= 1 ? Math.min(parsedLimit, 100) : 20;
    const [properties, total] = await this.prisma.$transaction([
      this.prisma.property.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          city: {
            select: {
              name: true,
              provinceName: true
            }
          },
          roomTypes: {
            orderBy: { createdAt: "asc" }
          }
        },
        skip: (page - 1) * limit,
        take: limit
      }),
      this.prisma.property.count()
    ]);
    return {
      data: properties.map((property) => ({
        id: property.id,
        name: property.name,
        address: property.address,
        city: property.city?.name ?? null,
        province: property.city?.provinceName ?? null,
        breakfast: {
          enabled: property.breakfastEnabled,
          pricePerPax: property.breakfastPricePerPax.toString(),
          currency: property.breakfastCurrency
        },
        roomTypes: property.roomTypes.map((room) => ({
          id: room.id,
          name: room.name,
          basePrice: room.basePrice.toString(),
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
        hasPrev: page > 1
      }
    };
  };
  cancelByUser = async (userId, bookingId, cancelledBy = CancelledBy.USER) => {
    if (cancelledBy !== CancelledBy.USER) {
      throw new ApiError("User hanya dapat membatalkan atas nama USER.", 400);
    }
    return this.prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        include: {
          paymentProofs: {
            where: {
              status: PaymentProofStatus.SUBMITTED
            },
            select: { id: true }
          },
          roomType: {
            select: {
              totalUnits: true,
              basePrice: true
            }
          },
          nights: {
            select: {
              stayDate: true
            }
          }
        }
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
          400
        );
      }
      if (booking.paymentProofs) {
        throw new ApiError(
          "Booking tidak bisa dibatalkan karena bukti pembayaran sudah diunggah.",
          400
        );
      }
      const cancelled = await this.cancelBookingWithInventoryRestore(
        tx,
        booking.id,
        CancelledBy.USER
      );
      if (!cancelled) {
        throw new ApiError("Booking tidak dapat dibatalkan.", 400);
      }
      return {
        message: "Booking berhasil dibatalkan.",
        id: booking.id
      };
    });
  };
  cancelByTenant = async (tenantAccountId, bookingId) => {
    const result = await this.prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        include: {
          paymentProofs: {
            where: {
              status: PaymentProofStatus.SUBMITTED
            },
            select: { id: true }
          },
          roomType: {
            select: {
              totalUnits: true,
              basePrice: true
            }
          },
          nights: {
            select: {
              stayDate: true
            }
          }
        }
      });
      if (!booking) {
        throw new ApiError("Booking tidak ditemukan.", 404);
      }
      if (booking.tenantId !== tenantAccountId) {
        throw new ApiError("Forbidden.", 403);
      }
      if (booking.status !== OrderStatus.MENUNGGU_PEMBAYARAN) {
        throw new ApiError(
          "Tenant hanya dapat membatalkan booking sebelum bukti pembayaran diupload.",
          400
        );
      }
      if (booking.paymentProofs) {
        throw new ApiError(
          "Booking tidak bisa dibatalkan karena bukti pembayaran sudah diunggah.",
          400
        );
      }
      const cancelled = await this.cancelBookingWithInventoryRestore(
        tx,
        booking.id,
        CancelledBy.TENANT
      );
      if (!cancelled) {
        throw new ApiError("Booking tidak dapat dibatalkan.", 400);
      }
      return {
        message: "Booking berhasil dibatalkan oleh tenant.",
        id: booking.id
      };
    });
    try {
      await this.sendTenantCancelledBookingEmail({
        bookingId: result.id
      });
    } catch (error) {
      console.error(
        `[BookingService] Failed to send tenant cancellation email for booking ${result.id}.`,
        error
      );
    }
    return result;
  };
  autoCancelExpiredUnpaidBookings = async () => {
    const now = /* @__PURE__ */ new Date();
    const candidates = await this.prisma.booking.findMany({
      where: {
        status: OrderStatus.MENUNGGU_PEMBAYARAN,
        OR: [{ proofDueAt: { lte: now } }, { paymentDueAt: { lte: now } }],
        AND: [
          {
            OR: [
              { paymentProofs: null },
              {
                paymentProofs: {
                  status: {
                    not: PaymentProofStatus.SUBMITTED
                  }
                }
              }
            ]
          },
          {
            OR: [
              { paymentMethod: PaymentMethod.XENDIT },
              {
                paymentProofs: {
                  isNot: {
                    status: PaymentProofStatus.APPROVED
                  }
                }
              }
            ]
          },
          {
            OR: [
              { paymentMethod: PaymentMethod.MANUAL_TRANSFER },
              {
                paymentProofs: {
                  isNot: {
                    status: PaymentProofStatus.REJECTED
                  }
                }
              }
            ]
          },
          {
            OR: [
              { paymentMethod: PaymentMethod.MANUAL_TRANSFER },
              {
                paymentMethod: PaymentMethod.XENDIT,
                paymentConfirmedAt: null,
                OR: [
                  { xenditInvoiceStatus: null },
                  {
                    xenditInvoiceStatus: {
                      notIn: ["PAID", "SETTLED"]
                    }
                  }
                ]
              }
            ]
          }
        ]
      },
      select: { id: true }
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
          CancelledBy.SYSTEM
        );
        if (cancelled) {
          cancelledCount += 1;
        }
      }
    });
    return { cancelled: cancelledCount };
  };
  autoCompleteFinishedBookings = async () => {
    const now = /* @__PURE__ */ new Date();
    const result = await this.prisma.booking.updateMany({
      where: {
        status: OrderStatus.DIPROSES,
        checkOut: {
          lte: now
        }
      },
      data: {
        status: OrderStatus.SELESAI
      }
    });
    return { completed: result.count };
  };
  sendHMinusOneCheckInReminders = async () => {
    const targetDateKey = this.getJakartaDateKey(1);
    const targetDate = this.parseDate(targetDateKey, "Tanggal reminder");
    const portalBaseUrl = APP_BASE_URL.replace(/\/$/, "");
    const candidates = await this.prisma.booking.findMany({
      where: {
        status: OrderStatus.DIPROSES,
        checkIn: targetDate,
        checkInReminderSentAt: null
      },
      select: {
        id: true,
        orderNo: true,
        checkIn: true,
        checkOut: true,
        guests: true,
        rooms: true,
        user: {
          select: {
            email: true,
            userProfile: {
              select: {
                fullName: true
              }
            }
          }
        },
        tenant: {
          select: {
            email: true,
            tenantProfile: {
              select: {
                displayName: true
              }
            }
          }
        },
        property: {
          select: {
            name: true
          }
        },
        roomType: {
          select: {
            name: true
          }
        }
      }
    });
    if (candidates.length === 0) {
      return { sent: 0 };
    }
    let sent = 0;
    for (const booking of candidates) {
      try {
        await sendCheckInReminderEmail({
          to: booking.user.email,
          userName: booking.user.userProfile?.fullName ?? booking.user.email,
          orderNo: booking.orderNo,
          propertyName: booking.property.name,
          roomTypeName: booking.roomType.name,
          checkIn: booking.checkIn,
          checkOut: booking.checkOut,
          guests: booking.guests,
          rooms: booking.rooms,
          tenantName: booking.tenant.tenantProfile?.displayName ?? booking.tenant.email,
          portalUrl: `${portalBaseUrl}/my-transaction?orderNo=${encodeURIComponent(booking.orderNo)}`
        });
        const updated = await this.prisma.booking.updateMany({
          where: {
            id: booking.id,
            checkInReminderSentAt: null
          },
          data: {
            checkInReminderSentAt: /* @__PURE__ */ new Date()
          }
        });
        if (updated.count > 0) {
          sent += 1;
        }
      } catch (error) {
        console.error(
          `[BookingService] Failed to send H-1 reminder for booking ${booking.id}.`,
          error
        );
      }
    }
    return { sent };
  };
  processXenditWebhook = async (callbackToken, payload) => {
    const expectedToken = this.normalizeCallbackToken(XENDIT_CALLBACK_TOKEN);
    const incomingToken = this.normalizeCallbackToken(callbackToken);
    if (!expectedToken) {
      throw new ApiError("Xendit callback token belum dikonfigurasi.", 500);
    }
    if (!incomingToken || incomingToken !== expectedToken) {
      throw new ApiError("Invalid callback token.", 401);
    }
    const invoiceId = this.normalizeWebhookText(payload.id);
    const externalId = this.normalizeWebhookText(payload.external_id);
    const status = this.normalizeWebhookText(payload.status)?.toUpperCase() ?? "";
    const paidAt = this.parseWebhookDate(payload.paid_at);
    if (!invoiceId && !externalId) {
      throw new ApiError("Payload webhook Xendit tidak valid.", 400);
    }
    const whereOr = [];
    if (invoiceId) {
      whereOr.push({ xenditInvoiceId: invoiceId });
    }
    if (externalId) {
      whereOr.push({ id: externalId });
    }
    const booking = await this.prisma.booking.findFirst({
      where: {
        paymentMethod: PaymentMethod.XENDIT,
        OR: whereOr
      },
      select: {
        id: true
      }
    });
    if (!booking) {
      return {
        message: "Webhook Xendit diterima, booking tidak ditemukan."
      };
    }
    await this.prisma.booking.update({
      where: { id: booking.id },
      data: {
        ...invoiceId ? { xenditInvoiceId: invoiceId } : {},
        ...status ? { xenditInvoiceStatus: status } : {}
      }
    });
    if (this.isXenditPaymentSettled(status)) {
      return this.confirmXenditBookingPayment(booking.id, paidAt ?? /* @__PURE__ */ new Date());
    }
    if (status === "EXPIRED") {
      const cancelled = await this.prisma.$transaction(
        (tx) => this.cancelBookingWithInventoryRestore(
          tx,
          booking.id,
          CancelledBy.SYSTEM
        )
      );
      return {
        message: cancelled ? "Pembayaran Xendit kedaluwarsa, booking dibatalkan." : "Webhook Xendit diterima.",
        bookingId: booking.id,
        status
      };
    }
    return {
      message: "Webhook Xendit diterima.",
      bookingId: booking.id,
      status: status || null
    };
  };
  syncPendingXenditBookings = async (scope) => {
    if (!XENDIT_SECRET_KEY) {
      return;
    }
    const pendingBookings = await this.prisma.booking.findMany({
      where: {
        ...scope,
        paymentMethod: PaymentMethod.XENDIT,
        status: OrderStatus.MENUNGGU_PEMBAYARAN,
        xenditInvoiceId: {
          not: null
        }
      },
      select: {
        id: true,
        xenditInvoiceId: true
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 20
    });
    for (const booking of pendingBookings) {
      const invoiceId = booking.xenditInvoiceId?.trim();
      if (!invoiceId) continue;
      try {
        const invoice = await getXenditInvoiceById(invoiceId);
        const invoiceStatus = this.normalizeWebhookText(invoice.status)?.toUpperCase() ?? null;
        const paidAt = this.parseWebhookDate(invoice.paid_at);
        await this.prisma.booking.update({
          where: { id: booking.id },
          data: {
            ...invoiceStatus ? { xenditInvoiceStatus: invoiceStatus } : {},
            ...invoice.invoice_url ? { xenditInvoiceUrl: invoice.invoice_url } : {}
          }
        });
        if (this.isXenditPaymentSettled(invoiceStatus)) {
          await this.confirmXenditBookingPayment(
            booking.id,
            paidAt ?? /* @__PURE__ */ new Date()
          );
          continue;
        }
        if (invoiceStatus === "EXPIRED") {
          await this.prisma.$transaction(
            (tx) => this.cancelBookingWithInventoryRestore(
              tx,
              booking.id,
              CancelledBy.SYSTEM
            )
          );
        }
      } catch (error) {
        console.error(
          `[BookingService] Failed to sync Xendit invoice status for booking ${booking.id}.`,
          error
        );
      }
    }
  };
  uploadPaymentProof = async (userId, bookingId, file) => {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        userId: true,
        status: true,
        paymentMethod: true,
        proofDueAt: true,
        paymentDueAt: true
      }
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
        400
      );
    }
    if (booking.status !== OrderStatus.MENUNGGU_PEMBAYARAN && booking.status !== OrderStatus.MENUNGGU_KONFIRMASI_PEMBAYARAN) {
      throw new ApiError(
        "Booking tidak dalam status yang bisa upload bukti pembayaran.",
        400
      );
    }
    const proofDeadline = booking.proofDueAt ?? booking.paymentDueAt;
    if (proofDeadline && Date.now() > proofDeadline.getTime()) {
      const proofDueMinutes = this.resolveBookingProofUploadDueMinutes();
      throw new ApiError(
        `Batas waktu upload bukti pembayaran (${proofDueMinutes} menit) sudah berakhir.`,
        400
      );
    }
    const pendingProof = await this.prisma.paymentProof.findFirst({
      where: {
        bookingId,
        status: PaymentProofStatus.SUBMITTED
      },
      select: { id: true }
    });
    if (pendingProof) {
      throw new ApiError(
        "Bukti pembayaran sudah dikirim dan menunggu konfirmasi tenant.",
        400
      );
    }
    const uploadedImage = await uploadImageBuffer(file, {
      folder: `payment-proofs/${bookingId}`
    });
    await this.prisma.$transaction([
      this.prisma.paymentProof.create({
        data: {
          bookingId,
          imageUrl: uploadedImage.secureUrl,
          status: PaymentProofStatus.SUBMITTED,
          method: PaymentMethod.MANUAL_TRANSFER
        }
      }),
      this.prisma.booking.update({
        where: { id: bookingId },
        data: {
          status: OrderStatus.MENUNGGU_KONFIRMASI_PEMBAYARAN
        }
      })
    ]);
    return {
      message: "Bukti pembayaran berhasil diupload.",
      imageUrl: uploadedImage.secureUrl
    };
  };
  listTenantPaymentProofs = async (tenantAccountId, dto) => {
    await this.syncPendingXenditBookings({ tenantId: tenantAccountId });
    const parsedPage = Number(dto.page);
    const parsedLimit = Number(dto.limit);
    const page = Number.isFinite(parsedPage) && parsedPage >= 1 ? parsedPage : 1;
    const limit = Number.isFinite(parsedLimit) && parsedLimit >= 1 ? Math.min(parsedLimit, 100) : 10;
    const skip = (page - 1) * limit;
    const status = dto.status ?? null;
    const sortBy = dto.sortBy ?? "submittedAt";
    const sortOrder = dto.sortOrder ?? "desc";
    const keyword = dto.keyword?.trim() ?? "";
    const keywordFilter = keyword.length > 0 ? keyword : null;
    const startDate = dto.startDate ? this.parseDate(dto.startDate, "Tanggal mulai") : null;
    const endDate = dto.endDate ? this.parseDate(dto.endDate, "Tanggal akhir") : null;
    if (startDate && endDate && endDate < startDate) {
      throw new ApiError("Tanggal akhir harus setelah tanggal mulai.", 400);
    }
    const bookingStatuses = dto.bookingStatus === OrderStatus.MENUNGGU_PEMBAYARAN ? [
      OrderStatus.MENUNGGU_PEMBAYARAN,
      OrderStatus.MENUNGGU_KONFIRMASI_PEMBAYARAN
    ] : dto.bookingStatus ? [dto.bookingStatus] : null;
    const submittedAtFilter = startDate || endDate ? {
      ...startDate ? { gte: this.startOfDayUTC(startDate) } : {},
      ...endDate ? { lte: this.endOfDayUTC(endDate) } : {}
    } : void 0;
    const bookingKeywordWhere = keywordFilter ? [
      {
        orderNo: { contains: keywordFilter, mode: "insensitive" }
      },
      {
        property: {
          name: { contains: keywordFilter, mode: "insensitive" }
        }
      },
      {
        roomType: {
          name: { contains: keywordFilter, mode: "insensitive" }
        }
      },
      {
        user: {
          email: { contains: keywordFilter, mode: "insensitive" }
        }
      },
      {
        user: {
          userProfile: {
            is: {
              fullName: { contains: keywordFilter, mode: "insensitive" }
            }
          }
        }
      },
      {
        user: {
          userProfile: {
            is: {
              phone: { contains: keywordFilter, mode: "insensitive" }
            }
          }
        }
      }
    ] : [];
    const bookingWhere = {
      tenantId: tenantAccountId,
      ...bookingStatuses ? { status: { in: bookingStatuses } } : {},
      ...bookingKeywordWhere.length > 0 ? { OR: bookingKeywordWhere } : {}
    };
    const manualProofs = await this.prisma.paymentProof.findMany({
      where: {
        ...status ? { status } : {},
        ...submittedAtFilter ? { submittedAt: submittedAtFilter } : {},
        booking: bookingWhere
      },
      orderBy: {
        submittedAt: "desc"
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
            subtotalAmount: true,
            appFeeAmount: true,
            taxAmount: true,
            tenantFeeAmount: true,
            tenantPayoutAmount: true,
            breakfastSelected: true,
            breakfastPax: true,
            breakfastUnitPrice: true,
            breakfastTotal: true,
            currency: true,
            status: true,
            property: {
              select: {
                id: true,
                name: true
              }
            },
            roomType: {
              select: {
                id: true,
                name: true
              }
            },
            user: {
              select: {
                id: true,
                email: true,
                userProfile: {
                  select: {
                    fullName: true,
                    phone: true
                  }
                }
              }
            }
          }
        }
      }
    });
    const latestManualProofByBooking = /* @__PURE__ */ new Map();
    for (const proof of manualProofs) {
      const current = latestManualProofByBooking.get(proof.bookingId);
      if (current) continue;
      latestManualProofByBooking.set(proof.bookingId, {
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
          subtotalAmount: proof.booking.subtotalAmount.toString(),
          appFeeAmount: proof.booking.appFeeAmount.toString(),
          taxAmount: proof.booking.taxAmount.toString(),
          tenantFeeAmount: proof.booking.tenantFeeAmount.toString(),
          tenantPayoutAmount: proof.booking.tenantPayoutAmount.toString(),
          breakfastSelected: proof.booking.breakfastSelected,
          breakfastPax: proof.booking.breakfastPax,
          breakfastUnitPrice: proof.booking.breakfastUnitPrice.toString(),
          breakfastTotal: proof.booking.breakfastTotal.toString(),
          currency: proof.booking.currency,
          status: proof.booking.status,
          property: proof.booking.property,
          roomType: proof.booking.roomType
        },
        user: {
          id: proof.booking.user.id,
          email: proof.booking.user.email,
          fullName: proof.booking.user.userProfile?.fullName ?? null,
          phone: proof.booking.user.userProfile?.phone ?? null
        }
      });
    }
    let combinedItems = Array.from(latestManualProofByBooking.values());
    const shouldIncludeUnsubmittedManual = status === null || status === PaymentProofStatus.SUBMITTED;
    if (shouldIncludeUnsubmittedManual) {
      const pendingManualBookings = await this.prisma.booking.findMany({
        where: {
          ...bookingWhere,
          paymentMethod: PaymentMethod.MANUAL_TRANSFER,
          status: OrderStatus.MENUNGGU_PEMBAYARAN,
          paymentProofs: null,
          ...submittedAtFilter ? { createdAt: submittedAtFilter } : {}
        },
        orderBy: {
          createdAt: "desc"
        },
        select: {
          id: true,
          orderNo: true,
          checkIn: true,
          checkOut: true,
          guests: true,
          rooms: true,
          totalAmount: true,
          subtotalAmount: true,
          appFeeAmount: true,
          taxAmount: true,
          tenantFeeAmount: true,
          tenantPayoutAmount: true,
          breakfastSelected: true,
          breakfastPax: true,
          breakfastUnitPrice: true,
          breakfastTotal: true,
          currency: true,
          status: true,
          createdAt: true,
          property: {
            select: {
              id: true,
              name: true
            }
          },
          roomType: {
            select: {
              id: true,
              name: true
            }
          },
          user: {
            select: {
              id: true,
              email: true,
              userProfile: {
                select: {
                  fullName: true,
                  phone: true
                }
              }
            }
          }
        }
      });
      const pendingVirtualProofs = pendingManualBookings.map((booking) => ({
        id: `pending-${booking.id}`,
        bookingId: booking.id,
        method: PaymentMethod.MANUAL_TRANSFER,
        status: PaymentProofStatus.SUBMITTED,
        imageUrl: "",
        submittedAt: booking.createdAt,
        reviewedAt: null,
        reviewNotes: "Belum upload bukti pembayaran.",
        booking: {
          id: booking.id,
          orderNo: booking.orderNo,
          checkIn: booking.checkIn,
          checkOut: booking.checkOut,
          guests: booking.guests,
          rooms: booking.rooms,
          totalAmount: booking.totalAmount.toString(),
          subtotalAmount: booking.subtotalAmount.toString(),
          appFeeAmount: booking.appFeeAmount.toString(),
          taxAmount: booking.taxAmount.toString(),
          tenantFeeAmount: booking.tenantFeeAmount.toString(),
          tenantPayoutAmount: booking.tenantPayoutAmount.toString(),
          breakfastSelected: booking.breakfastSelected,
          breakfastPax: booking.breakfastPax,
          breakfastUnitPrice: booking.breakfastUnitPrice.toString(),
          breakfastTotal: booking.breakfastTotal.toString(),
          currency: booking.currency,
          status: booking.status,
          property: booking.property,
          roomType: booking.roomType
        },
        user: {
          id: booking.user.id,
          email: booking.user.email,
          fullName: booking.user.userProfile?.fullName ?? null,
          phone: booking.user.userProfile?.phone ?? null
        }
      }));
      combinedItems = [...combinedItems, ...pendingVirtualProofs];
    }
    const shouldIncludeXendit = status === null || status === PaymentProofStatus.APPROVED;
    if (shouldIncludeXendit) {
      const xenditBookings = await this.prisma.booking.findMany({
        where: {
          ...bookingWhere,
          paymentMethod: PaymentMethod.XENDIT,
          ...submittedAtFilter ? { createdAt: submittedAtFilter } : {}
        },
        orderBy: {
          createdAt: "desc"
        },
        select: {
          id: true,
          orderNo: true,
          checkIn: true,
          checkOut: true,
          guests: true,
          rooms: true,
          totalAmount: true,
          subtotalAmount: true,
          appFeeAmount: true,
          taxAmount: true,
          tenantFeeAmount: true,
          tenantPayoutAmount: true,
          breakfastSelected: true,
          breakfastPax: true,
          breakfastUnitPrice: true,
          breakfastTotal: true,
          currency: true,
          status: true,
          createdAt: true,
          paymentConfirmedAt: true,
          xenditInvoiceUrl: true,
          xenditInvoiceStatus: true,
          property: {
            select: {
              id: true,
              name: true
            }
          },
          roomType: {
            select: {
              id: true,
              name: true
            }
          },
          user: {
            select: {
              id: true,
              email: true,
              userProfile: {
                select: {
                  fullName: true,
                  phone: true
                }
              }
            }
          }
        }
      });
      const xenditVirtualProofs = xenditBookings.map((booking) => ({
        id: `xendit-${booking.id}`,
        bookingId: booking.id,
        method: PaymentMethod.XENDIT,
        status: PaymentProofStatus.APPROVED,
        imageUrl: booking.xenditInvoiceUrl ?? "",
        submittedAt: booking.createdAt,
        reviewedAt: booking.paymentConfirmedAt,
        reviewNotes: booking.xenditInvoiceStatus ? `Xendit status: ${booking.xenditInvoiceStatus}` : "Xendit status: PENDING",
        booking: {
          id: booking.id,
          orderNo: booking.orderNo,
          checkIn: booking.checkIn,
          checkOut: booking.checkOut,
          guests: booking.guests,
          rooms: booking.rooms,
          totalAmount: booking.totalAmount.toString(),
          subtotalAmount: booking.subtotalAmount.toString(),
          appFeeAmount: booking.appFeeAmount.toString(),
          taxAmount: booking.taxAmount.toString(),
          tenantFeeAmount: booking.tenantFeeAmount.toString(),
          tenantPayoutAmount: booking.tenantPayoutAmount.toString(),
          breakfastSelected: booking.breakfastSelected,
          breakfastPax: booking.breakfastPax,
          breakfastUnitPrice: booking.breakfastUnitPrice.toString(),
          breakfastTotal: booking.breakfastTotal.toString(),
          currency: booking.currency,
          status: booking.status,
          property: booking.property,
          roomType: booking.roomType
        },
        user: {
          id: booking.user.id,
          email: booking.user.email,
          fullName: booking.user.userProfile?.fullName ?? null,
          phone: booking.user.userProfile?.phone ?? null
        }
      }));
      combinedItems = [...combinedItems, ...xenditVirtualProofs];
    }
    const compareText = (left, right) => left.localeCompare(right, "id-ID", { sensitivity: "base" });
    const compareNumber = (left, right) => left - right;
    const compareDate = (left, right) => left.getTime() - right.getTime();
    const toAmount = (value) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    };
    combinedItems.sort((a, b) => {
      let value = 0;
      if (sortBy === "total") {
        value = compareNumber(
          toAmount(a.booking.totalAmount),
          toAmount(b.booking.totalAmount)
        );
      } else if (sortBy === "checkIn") {
        value = compareDate(a.booking.checkIn, b.booking.checkIn);
      } else if (sortBy === "orderNo") {
        value = compareText(a.booking.orderNo, b.booking.orderNo);
      } else {
        value = compareDate(a.submittedAt, b.submittedAt);
      }
      if (value === 0) {
        value = compareDate(a.submittedAt, b.submittedAt);
      }
      if (value === 0) {
        value = compareText(a.booking.orderNo, b.booking.orderNo);
      }
      return sortOrder === "asc" ? value : -value;
    });
    const total = combinedItems.length;
    const totalPages = total > 0 ? Math.ceil(total / limit) : 1;
    const pagedData = combinedItems.slice(skip, skip + limit);
    return {
      data: pagedData,
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
        status,
        bookingStatus: dto.bookingStatus ?? null,
        keyword: keywordFilter,
        startDate: dto.startDate ?? null,
        endDate: dto.endDate ?? null,
        sortBy,
        sortOrder
      }
    };
  };
  listTenantSalesReport = async (tenantAccountId, dto) => {
    const parsedPage = Number(dto.page);
    const parsedLimit = Number(dto.limit);
    const page = Number.isFinite(parsedPage) && parsedPage >= 1 ? parsedPage : 1;
    const limit = Number.isFinite(parsedLimit) && parsedLimit >= 1 ? Math.min(parsedLimit, 100) : 10;
    const skip = (page - 1) * limit;
    const view = dto.view ?? "transaction";
    const sortBy = dto.sortBy ?? "date";
    const sortOrder = dto.sortOrder ?? "desc";
    const keywordRaw = dto.keyword?.trim() ?? "";
    const keyword = keywordRaw ? `%${keywordRaw}%` : null;
    const startDate = dto.startDate ? this.parseDate(dto.startDate, "Tanggal mulai") : null;
    const endDate = dto.endDate ? this.parseDate(dto.endDate, "Tanggal akhir") : null;
    if (startDate && endDate && endDate < startDate) {
      throw new ApiError("Tanggal akhir harus setelah tanggal mulai.", 400);
    }
    const startBoundary = startDate ? this.startOfDayUTC(startDate) : null;
    const endBoundary = endDate ? this.endOfDayUTC(endDate) : null;
    const dateFilters = [];
    if (startBoundary) {
      dateFilters.push(Prisma.sql`pb.transaction_date >= ${startBoundary}`);
    }
    if (endBoundary) {
      dateFilters.push(Prisma.sql`pb.transaction_date <= ${endBoundary}`);
    }
    const dateFilterSql = dateFilters.length > 0 ? Prisma.sql`${Prisma.join(dateFilters, " AND ")}` : Prisma.sql`TRUE`;
    const keywordFilterSql = this.buildSalesKeywordFilter(view, keyword);
    const ctesSql = Prisma.sql`
      WITH paid_bookings AS (
        SELECT
          b.id,
          b.order_no,
          b.check_in,
          b.check_out,
          b.status,
          b.subtotal_amount,
          b.tenant_payout_amount,
          b.total_amount,
          b.property_id,
          p.name AS property_name,
          b.user_id,
          COALESCE(NULLIF(up.full_name, ''), a.email) AS user_name,
          COALESCE(b.payment_confirmed_at, b.created_at) AS transaction_date
        FROM bookings b
        JOIN properties p ON p.id = b.property_id
        JOIN accounts a ON a.id = b.user_id
        LEFT JOIN user_profiles up ON up.account_id = a.id
        WHERE
          b.tenant_id = ${tenantAccountId}
          AND (
            (
              b.payment_method = ${PaymentMethod.MANUAL_TRANSFER}::payment_method
              AND EXISTS (
                SELECT 1
                FROM payment_proofs pp
                WHERE pp.booking_id = b.id
                  AND pp.status = ${PaymentProofStatus.APPROVED}::payment_proof_status
              )
            )
            OR (
              b.payment_method = ${PaymentMethod.XENDIT}::payment_method
              AND (
                b.payment_confirmed_at IS NOT NULL
                OR UPPER(COALESCE(b.xendit_invoice_status, '')) IN ('PAID', 'SETTLED')
              )
            )
          )
      ),
      filtered_bookings AS (
        SELECT *
        FROM paid_bookings pb
        WHERE ${dateFilterSql}
          AND ${keywordFilterSql}
      )
    `;
    let data = [];
    let total = 0;
    if (view === "transaction") {
      const orderBySql = this.buildSalesTransactionOrderBy(sortBy, sortOrder);
      const rows = await this.prisma.$queryRaw(Prisma.sql`
        ${ctesSql}
        SELECT
          fb.id,
          fb.order_no AS "orderNo",
          fb.transaction_date AS "submittedAt",
          fb.check_in AS "checkIn",
          fb.property_id AS "propertyId",
          fb.property_name AS property,
          fb.user_id AS "userId",
          fb.user_name AS "user",
          fb.status,
          fb.subtotal_amount AS "grossTotal",
          fb.tenant_payout_amount AS "netPayout",
          fb.total_amount AS total
        FROM filtered_bookings fb
        ${orderBySql}
        LIMIT ${limit}
        OFFSET ${skip}
      `);
      const [countRow] = await this.prisma.$queryRaw(Prisma.sql`
        ${ctesSql}
        SELECT COUNT(*)::bigint AS total
        FROM filtered_bookings
      `);
      total = this.parseIntegerLike(countRow?.total);
      data = rows.map((row) => ({
        id: row.id,
        orderNo: row.orderNo,
        submittedAt: this.toISOStringSafe(row.submittedAt),
        checkIn: this.toDateOnlyStringSafe(row.checkIn),
        propertyId: row.propertyId,
        property: row.property,
        userId: row.userId,
        user: row.user,
        status: row.status,
        grossTotal: this.decimalLikeToNumber(row.grossTotal),
        netPayout: this.decimalLikeToNumber(row.netPayout),
        total: this.decimalLikeToNumber(row.total)
      }));
    }
    if (view === "property") {
      const orderBySql = this.buildSalesAggregateOrderBy(sortBy, sortOrder);
      const rows = await this.prisma.$queryRaw(Prisma.sql`
        ${ctesSql}
        ,
        property_rows AS (
          SELECT
            fb.property_id AS "propertyId",
            fb.property_name AS "propertyName",
            COUNT(*)::bigint AS transactions,
            COUNT(DISTINCT fb.user_id)::bigint AS users,
            COALESCE(
              SUM(
                CASE
                  WHEN fb.status <> ${OrderStatus.DIBATALKAN}::order_status
                  THEN fb.total_amount
                  ELSE 0
                END
              ),
              0
            ) AS "totalSales",
            COALESCE(
              SUM(
                CASE
                  WHEN fb.status <> ${OrderStatus.DIBATALKAN}::order_status
                  THEN fb.tenant_payout_amount
                  ELSE 0
                END
              ),
              0
            ) AS "netPayout",
            MAX(fb.transaction_date) AS "latestTransactionAt"
          FROM filtered_bookings fb
          GROUP BY fb.property_id, fb.property_name
        )
        SELECT
          pr."propertyId",
          pr."propertyName",
          pr.transactions,
          pr.users,
          pr."totalSales",
          pr."netPayout",
          pr."latestTransactionAt"
        FROM property_rows pr
        ${orderBySql}
        LIMIT ${limit}
        OFFSET ${skip}
      `);
      const [countRow] = await this.prisma.$queryRaw(Prisma.sql`
        ${ctesSql}
        ,
        property_rows AS (
          SELECT fb.property_id
          FROM filtered_bookings fb
          GROUP BY fb.property_id
        )
        SELECT COUNT(*)::bigint AS total
        FROM property_rows
      `);
      total = this.parseIntegerLike(countRow?.total);
      data = rows.map((row) => ({
        propertyId: row.propertyId,
        propertyName: row.propertyName,
        transactions: this.parseIntegerLike(row.transactions),
        users: this.parseIntegerLike(row.users),
        totalSales: this.decimalLikeToNumber(row.totalSales),
        netPayout: this.decimalLikeToNumber(row.netPayout),
        latestTransactionAt: this.toISOStringSafe(row.latestTransactionAt)
      }));
    }
    if (view === "user") {
      const orderBySql = this.buildSalesAggregateOrderBy(sortBy, sortOrder);
      const rows = await this.prisma.$queryRaw(Prisma.sql`
        ${ctesSql}
        ,
        user_rows AS (
          SELECT
            fb.user_id AS "userId",
            fb.user_name AS "userName",
            COUNT(*)::bigint AS transactions,
            COUNT(DISTINCT fb.property_id)::bigint AS properties,
            COALESCE(
              SUM(
                CASE
                  WHEN fb.status <> ${OrderStatus.DIBATALKAN}::order_status
                  THEN fb.total_amount
                  ELSE 0
                END
              ),
              0
            ) AS "totalSales",
            COALESCE(
              SUM(
                CASE
                  WHEN fb.status <> ${OrderStatus.DIBATALKAN}::order_status
                  THEN fb.tenant_payout_amount
                  ELSE 0
                END
              ),
              0
            ) AS "netPayout",
            MAX(fb.transaction_date) AS "latestTransactionAt"
          FROM filtered_bookings fb
          GROUP BY fb.user_id, fb.user_name
        )
        SELECT
          ur."userId",
          ur."userName",
          ur.transactions,
          ur.properties,
          ur."totalSales",
          ur."netPayout",
          ur."latestTransactionAt"
        FROM user_rows ur
        ${orderBySql}
        LIMIT ${limit}
        OFFSET ${skip}
      `);
      const [countRow] = await this.prisma.$queryRaw(Prisma.sql`
        ${ctesSql}
        ,
        user_rows AS (
          SELECT fb.user_id
          FROM filtered_bookings fb
          GROUP BY fb.user_id
        )
        SELECT COUNT(*)::bigint AS total
        FROM user_rows
      `);
      total = this.parseIntegerLike(countRow?.total);
      data = rows.map((row) => ({
        userId: row.userId,
        userName: row.userName,
        transactions: this.parseIntegerLike(row.transactions),
        properties: this.parseIntegerLike(row.properties),
        totalSales: this.decimalLikeToNumber(row.totalSales),
        netPayout: this.decimalLikeToNumber(row.netPayout),
        latestTransactionAt: this.toISOStringSafe(row.latestTransactionAt)
      }));
    }
    const [summaryRow] = await this.prisma.$queryRaw(Prisma.sql`
      ${ctesSql}
      SELECT
        COALESCE(
          SUM(
            CASE
              WHEN fb.status <> ${OrderStatus.DIBATALKAN}::order_status
              THEN fb.total_amount
              ELSE 0
            END
          ),
          0
        ) AS "totalSales",
        COALESCE(
          SUM(
            CASE
              WHEN fb.status <> ${OrderStatus.DIBATALKAN}::order_status
              THEN fb.tenant_payout_amount
              ELSE 0
            END
          ),
          0
        ) AS "totalNetPayout",
        COUNT(*)::bigint AS "totalTransactions"
      FROM filtered_bookings fb
    `);
    const trendAnchor = endDate ? new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), 1)) : new Date(
      Date.UTC((/* @__PURE__ */ new Date()).getUTCFullYear(), (/* @__PURE__ */ new Date()).getUTCMonth(), 1)
    );
    const trendStart = new Date(
      Date.UTC(trendAnchor.getUTCFullYear(), trendAnchor.getUTCMonth() - 6, 1)
    );
    const trendRows = await this.prisma.$queryRaw(Prisma.sql`
      ${ctesSql}
      ,
      month_series AS (
        SELECT
          generate_series(
            ${trendStart}::date,
            ${trendAnchor}::date,
            interval '1 month'
          )::date AS month_start
      )
      SELECT
        ms.month_start AS "monthStart",
        COALESCE(
          SUM(
            CASE
              WHEN fb.status <> ${OrderStatus.DIBATALKAN}::order_status
              THEN fb.total_amount
              ELSE 0
            END
          ),
          0
        ) AS sales,
        COUNT(fb.id)::bigint AS bookings
      FROM month_series ms
      LEFT JOIN filtered_bookings fb
        ON fb.transaction_date >= ms.month_start::timestamptz
        AND fb.transaction_date < (ms.month_start + interval '1 month')::timestamptz
      GROUP BY ms.month_start
      ORDER BY ms.month_start ASC
    `);
    const totalSales = this.decimalLikeToNumber(summaryRow?.totalSales ?? 0);
    const totalNetPayout = this.decimalLikeToNumber(
      summaryRow?.totalNetPayout ?? 0
    );
    const totalTransactions = this.parseIntegerLike(
      summaryRow?.totalTransactions ?? 0
    );
    const monthFormatter = new Intl.DateTimeFormat("id-ID", {
      month: "short",
      year: "2-digit",
      timeZone: "UTC"
    });
    return {
      data,
      summary: {
        totalSales,
        totalNetPayout,
        totalTransactions,
        avgPerTransaction: totalTransactions > 0 ? Math.round(totalSales / totalTransactions) : 0
      },
      trend: trendRows.map((row) => ({
        month: monthFormatter.format(this.coerceDateValue(row.monthStart)),
        sales: this.decimalLikeToNumber(row.sales),
        bookings: this.parseIntegerLike(row.bookings)
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        hasNext: page * limit < total,
        hasPrev: page > 1,
        view,
        sortBy,
        sortOrder,
        startDate: startDate ? this.toDateKey(startDate) : null,
        endDate: endDate ? this.toDateKey(endDate) : null,
        keyword: keywordRaw || null
      }
    };
  };
  approvePaymentProof = async (tenantAccountId, paymentProofId, dto) => {
    const proof = await this.getTenantProof(tenantAccountId, paymentProofId);
    if (proof.status !== PaymentProofStatus.SUBMITTED) {
      throw new ApiError("Bukti pembayaran sudah diproses.", 400);
    }
    const reviewNotes = this.normalizeReviewNotes(dto?.notes);
    const reviewedAt = /* @__PURE__ */ new Date();
    const [updatedProof] = await this.prisma.$transaction([
      this.prisma.paymentProof.update({
        where: { id: paymentProofId },
        data: {
          status: PaymentProofStatus.APPROVED,
          reviewedAt,
          reviewNotes
        }
      }),
      this.prisma.booking.update({
        where: { id: proof.bookingId },
        data: {
          status: OrderStatus.DIPROSES,
          paymentConfirmedAt: reviewedAt
        }
      })
    ]);
    let receiptEmailSent = false;
    try {
      await this.sendApprovedBookingReceiptEmail({
        bookingId: proof.bookingId,
        approvedAt: reviewedAt,
        paymentMethod: updatedProof.method,
        reviewNotes
      });
      receiptEmailSent = true;
    } catch (error) {
      console.error(
        `[BookingService] Failed to send booking receipt email for booking ${proof.bookingId}.`,
        error
      );
    }
    return {
      message: "Bukti pembayaran disetujui.",
      paymentProof: {
        id: updatedProof.id,
        status: updatedProof.status,
        reviewedAt: updatedProof.reviewedAt,
        reviewNotes: updatedProof.reviewNotes
      },
      receiptEmailSent
    };
  };
  rejectPaymentProof = async (tenantAccountId, paymentProofId, dto) => {
    const proof = await this.getTenantProof(tenantAccountId, paymentProofId);
    if (proof.status !== PaymentProofStatus.SUBMITTED) {
      throw new ApiError("Bukti pembayaran sudah diproses.", 400);
    }
    const reviewNotes = this.normalizeReviewNotes(dto?.notes);
    const reviewedAt = /* @__PURE__ */ new Date();
    const [updatedProof] = await this.prisma.$transaction([
      this.prisma.paymentProof.update({
        where: { id: paymentProofId },
        data: {
          status: PaymentProofStatus.REJECTED,
          reviewedAt,
          reviewNotes
        }
      }),
      this.prisma.booking.update({
        where: { id: proof.bookingId },
        data: {
          status: OrderStatus.MENUNGGU_PEMBAYARAN,
          paymentConfirmedAt: null
        }
      })
    ]);
    return {
      message: "Bukti pembayaran ditolak.",
      paymentProof: {
        id: updatedProof.id,
        status: updatedProof.status,
        reviewedAt: updatedProof.reviewedAt,
        reviewNotes: updatedProof.reviewNotes
      }
    };
  };
  createReview = async (userId, bookingId, dto) => {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        review: {
          select: { id: true }
        }
      }
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
        400
      );
    }
    const now = /* @__PURE__ */ new Date();
    if (now < booking.checkOut) {
      throw new ApiError(
        "Review hanya bisa dikirim setelah tanggal check-out.",
        400
      );
    }
    if (booking.status !== OrderStatus.SELESAI) {
      if (booking.status === OrderStatus.DIPROSES) {
        await this.prisma.booking.update({
          where: { id: bookingId },
          data: {
            status: OrderStatus.SELESAI
          }
        });
      } else {
        throw new ApiError(
          "Review hanya bisa diberikan saat booking sudah selesai.",
          400
        );
      }
    }
    const comment = dto.comment.trim();
    if (!comment) {
      throw new ApiError("Komentar review wajib diisi.", 400);
    }
    const timestamp = /* @__PURE__ */ new Date();
    let created;
    try {
      const createdReview = await this.prisma.review.create({
        data: {
          bookingId,
          propertyId: booking.propertyId,
          roomTypeId: booking.roomTypeId,
          userId: booking.userId,
          tenantId: booking.tenantId,
          rating: dto.rating,
          comment,
          createdAt: timestamp,
          updatedAt: timestamp
        },
        select: {
          id: true,
          bookingId: true,
          rating: true,
          comment: true,
          createdAt: true
        }
      });
      created = {
        id: createdReview.id,
        bookingId: createdReview.bookingId,
        rating: createdReview.rating ?? dto.rating,
        comment: createdReview.comment,
        createdAt: createdReview.createdAt
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2011") {
        const legacyRows = await this.prisma.$queryRaw`
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
          createdAt: legacyCreated.created_at
        };
      } else {
        throw error;
      }
    }
    return {
      message: "Review berhasil dikirim.",
      review: created
    };
  };
  listTenantReviews = async (tenantAccountId, dto) => {
    const parsedPage = Number(dto.page);
    const parsedLimit = Number(dto.limit);
    const page = Number.isFinite(parsedPage) && parsedPage >= 1 ? parsedPage : 1;
    const limit = Number.isFinite(parsedLimit) && parsedLimit >= 1 ? Math.min(parsedLimit, 100) : 10;
    const repliedFilter = dto.replied;
    const keyword = dto.keyword?.trim() ?? "";
    const ratingFilter = Number(dto.rating);
    const sortBy = dto.sortBy ?? "createdAt";
    const sortOrder = dto.sortOrder === "asc" ? "asc" : "desc";
    const filters = [
      {
        booking: {
          tenantId: tenantAccountId
        }
      }
    ];
    if (repliedFilter === "true") {
      filters.push({
        tenantReply: {
          not: null
        }
      });
    }
    if (repliedFilter === "false") {
      filters.push({
        tenantReply: null
      });
    }
    if (Number.isInteger(ratingFilter) && ratingFilter >= 1 && ratingFilter <= 5) {
      filters.push({
        rating: ratingFilter
      });
    }
    if (keyword) {
      filters.push({
        OR: [
          {
            comment: {
              contains: keyword,
              mode: "insensitive"
            }
          },
          {
            booking: {
              orderNo: {
                contains: keyword,
                mode: "insensitive"
              }
            }
          },
          {
            booking: {
              property: {
                name: {
                  contains: keyword,
                  mode: "insensitive"
                }
              }
            }
          },
          {
            booking: {
              user: {
                email: {
                  contains: keyword,
                  mode: "insensitive"
                }
              }
            }
          },
          {
            booking: {
              user: {
                userProfile: {
                  is: {
                    fullName: {
                      contains: keyword,
                      mode: "insensitive"
                    }
                  }
                }
              }
            }
          }
        ]
      });
    }
    const where = {
      AND: filters
    };
    const orderBy = sortBy === "rating" ? [{ rating: sortOrder }, { createdAt: "desc" }, { id: "desc" }] : [{ createdAt: sortOrder }, { rating: "desc" }, { id: "desc" }];
    const [data, total] = await this.prisma.$transaction([
      this.prisma.review.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy,
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
                  name: true
                }
              },
              user: {
                select: {
                  id: true,
                  email: true,
                  userProfile: {
                    select: {
                      fullName: true
                    }
                  }
                }
              }
            }
          }
        }
      }),
      this.prisma.review.count({ where })
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
          property: item.booking.property
        },
        user: {
          id: item.booking.user.id,
          email: item.booking.user.email,
          fullName: item.booking.user.userProfile?.fullName ?? null
        }
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
        replied: repliedFilter ?? null,
        keyword: keyword || null,
        rating: Number.isInteger(ratingFilter) && ratingFilter >= 1 && ratingFilter <= 5 ? ratingFilter : null,
        sortBy,
        sortOrder
      }
    };
  };
  replyReview = async (tenantAccountId, reviewId, dto) => {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
      include: {
        booking: {
          select: {
            tenantId: true
          }
        }
      }
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
        tenantRepliedAt: /* @__PURE__ */ new Date()
      },
      select: {
        id: true,
        tenantReply: true,
        tenantRepliedAt: true
      }
    });
    return {
      message: "Balasan review berhasil disimpan.",
      review: updated
    };
  };
  async buildQuote(client, dto) {
    const { checkIn, checkOut } = this.resolveQuoteDateRange(dto);
    const roomType = await this.findQuoteRoomType(client, dto.roomTypeId);
    this.assertQuotePropertyMatch(roomType, dto.propertyId);
    const nights = this.resolveQuoteNights(checkIn, checkOut);
    const rateRules = await this.findQuoteRateRules(client, roomType, checkIn, nights[nights.length - 1]);
    const calendarMap = await this.buildQuoteCalendarMap(client, roomType.id, nights);
    const nightTotals = this.buildQuoteNightTotals({ roomType, dto, rateRules, calendarMap, nights });
    const breakfast = this.resolveQuoteBreakfast(dto, roomType, nights.length);
    const pricing = this.buildQuotePricing(nightTotals.roomSubtotal, breakfast, roomType.property.breakfastCurrency || PRICING_CURRENCY);
    return this.composeQuote(dto, roomType, checkIn, checkOut, nightTotals, pricing);
  }
  resolveQuoteDateRange(dto) {
    const checkIn = this.parseDate(dto.checkIn, "Check-in");
    const checkOut = this.parseDate(dto.checkOut, "Check-out");
    if (checkOut.getTime() <= checkIn.getTime()) throw new ApiError("Check-out harus setelah check-in.", 400);
    return { checkIn, checkOut };
  }
  async findQuoteRoomType(client, roomTypeId) {
    const roomType = await client.roomType.findUnique({
      where: { id: roomTypeId },
      select: BOOKING_QUOTE_ROOM_TYPE_SELECT
    });
    if (!roomType) throw new ApiError("Room tidak ditemukan.", 404);
    return roomType;
  }
  assertQuotePropertyMatch(roomType, propertyId) {
    if (roomType.propertyId !== propertyId) {
      throw new ApiError("Properti tidak sesuai dengan room.", 400);
    }
  }
  resolveQuoteNights(checkIn, checkOut) {
    const nights = this.buildStayDates(checkIn, checkOut);
    if (nights.length === 0) throw new ApiError("Tanggal booking tidak valid.", 400);
    return nights;
  }
  findQuoteRateRules(client, roomType, checkIn, lastNight) {
    return client.rateRule.findMany({
      where: {
        tenantAccountId: roomType.property.tenantAccountId,
        isActive: true,
        OR: [{ scope: RateScope.ROOM_TYPE, roomTypeId: roomType.id }, { scope: RateScope.PROPERTY, propertyId: roomType.propertyId }],
        startDate: { lte: lastNight },
        endDate: { gte: checkIn }
      },
      orderBy: { startDate: "asc" },
      select: { adjustmentType: true, adjustmentValue: true, startDate: true, endDate: true }
    });
  }
  async buildQuoteCalendarMap(client, roomTypeId, nights) {
    const entries = await client.roomTypeCalendar.findMany({
      where: { roomTypeId, date: { in: nights } },
      select: { date: true, availableUnits: true, isClosed: true, price: true }
    });
    return new Map(entries.map((entry) => [this.toDateKey(entry.date), entry]));
  }
  createEmptyQuoteNightTotals() {
    return {
      quoteNights: [],
      baseTotal: new Prisma.Decimal(0),
      adjustmentTotal: new Prisma.Decimal(0),
      roomSubtotal: new Prisma.Decimal(0)
    };
  }
  buildQuoteNightTotals(payload) {
    const totals = this.createEmptyQuoteNightTotals();
    const context = { ...payload, roomsCount: new Prisma.Decimal(payload.dto.rooms), basePrice: new Prisma.Decimal(payload.roomType.basePrice) };
    for (const date of payload.nights) this.addQuoteNight(totals, date, context);
    return totals;
  }
  addQuoteNight(totals, date, context) {
    const snapshot = this.resolveQuoteNightSnapshot(date, context.roomType, context.calendarMap);
    this.assertQuoteNightAvailability(snapshot.dateKey, snapshot.isClosed, snapshot.availableUnits, context.dto.rooms);
    const adjustment = this.calculateAdjustment(context.basePrice, context.rateRules, date);
    const pricePerNight = context.basePrice.add(adjustment);
    this.accumulateQuoteNightTotals(totals, context.basePrice, adjustment, pricePerNight, context.roomsCount);
    totals.quoteNights.push(this.toQuoteNight(date, snapshot, context.basePrice, adjustment, pricePerNight));
  }
  resolveQuoteNightSnapshot(date, roomType, calendarMap) {
    const dateKey = this.toDateKey(date);
    const entry = calendarMap.get(dateKey);
    return {
      dateKey,
      entry,
      isClosed: entry?.isClosed ?? false,
      availableUnits: entry?.availableUnits ?? roomType.totalUnits
    };
  }
  assertQuoteNightAvailability(dateKey, isClosed, availableUnits, requestedRooms) {
    if (isClosed) throw new ApiError(`Room tidak tersedia pada tanggal ${dateKey}.`, 400);
    if (availableUnits < requestedRooms) throw new ApiError(`Stok room tidak mencukupi pada tanggal ${dateKey}.`, 400);
  }
  accumulateQuoteNightTotals(totals, basePrice, adjustment, pricePerNight, roomsCount) {
    totals.baseTotal = totals.baseTotal.add(basePrice.mul(roomsCount));
    totals.adjustmentTotal = totals.adjustmentTotal.add(adjustment.mul(roomsCount));
    totals.roomSubtotal = totals.roomSubtotal.add(pricePerNight.mul(roomsCount));
  }
  toQuoteNight(date, snapshot, basePrice, adjustment, pricePerNight) {
    return {
      date,
      dateKey: snapshot.dateKey,
      availableUnits: snapshot.availableUnits,
      isClosed: snapshot.isClosed,
      basePrice,
      adjustment,
      pricePerNight,
      existingPrice: snapshot.entry?.price ?? null
    };
  }
  resolveQuoteBreakfast(dto, roomType, nightsCount) {
    const breakfastSelected = Boolean(dto.breakfastSelected);
    if (!breakfastSelected) return this.emptyQuoteBreakfast();
    this.assertBreakfastEnabled(roomType.property.breakfastEnabled);
    const breakfastPax = this.resolveBreakfastPax(dto);
    const breakfastUnitPrice = new Prisma.Decimal(roomType.property.breakfastPricePerPax);
    const breakfastNights = nightsCount;
    const breakfastTotal = breakfastUnitPrice.mul(new Prisma.Decimal(breakfastPax)).mul(new Prisma.Decimal(breakfastNights));
    return { breakfastSelected, breakfastPax, breakfastUnitPrice, breakfastNights, breakfastTotal };
  }
  emptyQuoteBreakfast() {
    return {
      breakfastSelected: false,
      breakfastPax: 0,
      breakfastUnitPrice: new Prisma.Decimal(0),
      breakfastNights: 0,
      breakfastTotal: new Prisma.Decimal(0)
    };
  }
  assertBreakfastEnabled(breakfastEnabled) {
    if (!breakfastEnabled) throw new ApiError("Sarapan tidak tersedia untuk properti ini.", 400);
  }
  resolveBreakfastPax(dto) {
    const requestedPax = dto.breakfastPax ?? dto.guests;
    if (!Number.isInteger(requestedPax) || requestedPax < 1) throw new ApiError("Jumlah pax sarapan tidak valid.", 400);
    if (requestedPax > dto.guests) throw new ApiError("Jumlah pax sarapan melebihi jumlah tamu.", 400);
    return requestedPax;
  }
  buildQuotePricing(roomSubtotal, breakfast, currency) {
    const subtotalAmount = roomSubtotal.add(breakfast.breakfastTotal);
    const appFeeAmount = this.roundCurrencyAmount(subtotalAmount.mul(APP_FEE_RATE));
    const taxAmount = this.roundCurrencyAmount(subtotalAmount.mul(TAX_RATE));
    const tenantFeeAmount = this.roundCurrencyAmount(subtotalAmount.mul(TENANT_FEE_RATE));
    const tenantPayoutAmount = subtotalAmount.sub(tenantFeeAmount);
    const totalAmount = subtotalAmount.add(appFeeAmount).add(taxAmount);
    return {
      currency,
      roomSubtotal,
      ...breakfast,
      subtotalAmount,
      appFeeRate: APP_FEE_RATE,
      appFeeAmount,
      taxRate: TAX_RATE,
      taxAmount,
      tenantFeeRate: TENANT_FEE_RATE,
      tenantFeeAmount,
      tenantPayoutAmount,
      totalAmount
    };
  }
  composeQuote(dto, roomType, checkIn, checkOut, nightTotals, pricing) {
    return {
      roomTypeId: roomType.id,
      propertyId: roomType.propertyId,
      tenantAccountId: roomType.property.tenantAccountId,
      checkIn,
      checkOut,
      rooms: dto.rooms,
      guests: dto.guests,
      nights: nightTotals.quoteNights,
      baseTotal: nightTotals.baseTotal,
      adjustmentTotal: nightTotals.adjustmentTotal,
      pricing
    };
  }
  async cancelBookingWithInventoryRestore(tx, bookingId, cancelledBy) {
    const booking = await tx.booking.findUnique({
      where: { id: bookingId },
      include: {
        paymentProofs: {
          where: {
            status: PaymentProofStatus.SUBMITTED
          },
          select: { id: true }
        },
        roomType: {
          select: {
            id: true,
            totalUnits: true,
            basePrice: true
          }
        },
        nights: {
          select: {
            stayDate: true
          }
        }
      }
    });
    if (!booking) return false;
    if (booking.status !== OrderStatus.MENUNGGU_PEMBAYARAN) return false;
    if (booking.paymentProofs) return false;
    const cancelledResult = await tx.booking.updateMany({
      where: {
        id: booking.id,
        status: OrderStatus.MENUNGGU_PEMBAYARAN
      },
      data: {
        status: OrderStatus.DIBATALKAN,
        cancelledBy,
        cancelledAt: /* @__PURE__ */ new Date()
      }
    });
    if (cancelledResult.count === 0) return false;
    await this.releaseRoomInventory(tx, {
      roomTypeId: booking.roomTypeId,
      roomTotalUnits: booking.roomType.totalUnits,
      roomBasePrice: booking.roomType.basePrice,
      rooms: booking.rooms,
      nights: booking.nights.map((night) => night.stayDate)
    });
    return true;
  }
  async releaseRoomInventory(tx, payload) {
    for (const stayDate of payload.nights) {
      const existing = await tx.roomTypeCalendar.findUnique({
        where: {
          roomTypeId_date: {
            roomTypeId: payload.roomTypeId,
            date: stayDate
          }
        },
        select: {
          availableUnits: true,
          isClosed: true,
          price: true
        }
      });
      const restoredUnits = existing ? Math.min(
        payload.roomTotalUnits,
        existing.availableUnits + payload.rooms
      ) : payload.roomTotalUnits;
      await tx.roomTypeCalendar.upsert({
        where: {
          roomTypeId_date: {
            roomTypeId: payload.roomTypeId,
            date: stayDate
          }
        },
        update: {
          availableUnits: restoredUnits,
          isClosed: existing?.isClosed ?? false,
          price: existing?.price ?? payload.roomBasePrice,
          updatedAt: /* @__PURE__ */ new Date()
        },
        create: {
          roomTypeId: payload.roomTypeId,
          date: stayDate,
          availableUnits: restoredUnits,
          isClosed: false,
          price: payload.roomBasePrice
        }
      });
    }
  }
  calculateAdjustment(basePrice, rules, date) {
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
  buildSalesKeywordFilter(view, keyword) {
    if (!keyword) return Prisma.sql`TRUE`;
    if (view === "property") {
      return Prisma.sql`pb.property_name ILIKE ${keyword}`;
    }
    if (view === "user") {
      return Prisma.sql`pb.user_name ILIKE ${keyword}`;
    }
    return Prisma.sql`
      (
        pb.order_no ILIKE ${keyword}
        OR pb.property_name ILIKE ${keyword}
        OR pb.user_name ILIKE ${keyword}
      )
    `;
  }
  buildSalesTransactionOrderBy(sortBy, sortOrder) {
    if (sortBy === "total") {
      if (sortOrder === "asc") {
        return Prisma.sql`
          ORDER BY fb.total_amount ASC, fb.transaction_date ASC, fb.id ASC
        `;
      }
      return Prisma.sql`
        ORDER BY fb.total_amount DESC, fb.transaction_date DESC, fb.id DESC
      `;
    }
    if (sortOrder === "asc") {
      return Prisma.sql`
        ORDER BY fb.transaction_date ASC, fb.total_amount ASC, fb.id ASC
      `;
    }
    return Prisma.sql`
      ORDER BY fb.transaction_date DESC, fb.total_amount DESC, fb.id DESC
    `;
  }
  buildSalesAggregateOrderBy(sortBy, sortOrder) {
    if (sortBy === "total") {
      if (sortOrder === "asc") {
        return Prisma.sql`
          ORDER BY "totalSales" ASC, "latestTransactionAt" ASC
        `;
      }
      return Prisma.sql`
        ORDER BY "totalSales" DESC, "latestTransactionAt" DESC
      `;
    }
    if (sortOrder === "asc") {
      return Prisma.sql`
        ORDER BY "latestTransactionAt" ASC, "totalSales" ASC
      `;
    }
    return Prisma.sql`
      ORDER BY "latestTransactionAt" DESC, "totalSales" DESC
    `;
  }
  parseIntegerLike(value) {
    if (typeof value === "bigint") return Number(value);
    const numericValue = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
    if (!Number.isFinite(numericValue)) return 0;
    return Math.trunc(numericValue);
  }
  decimalLikeToNumber(value) {
    if (value === null || value === void 0) return 0;
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    if (typeof value === "string") {
      const parsed2 = Number(value);
      return Number.isFinite(parsed2) ? parsed2 : 0;
    }
    const parsed = Number(value.toString());
    return Number.isFinite(parsed) ? parsed : 0;
  }
  coerceDateValue(value) {
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) return /* @__PURE__ */ new Date(0);
      return value;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return /* @__PURE__ */ new Date(0);
    return parsed;
  }
  toISOStringSafe(value) {
    if (!value) return null;
    const parsed = this.coerceDateValue(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  toDateOnlyStringSafe(value) {
    if (!value) return null;
    const parsed = this.coerceDateValue(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString().slice(0, 10);
  }
  resolveBookingPaymentDueMinutes() {
    if (Number.isFinite(BOOKING_PAYMENT_DUE_MINUTES) && BOOKING_PAYMENT_DUE_MINUTES > 0) {
      return Math.floor(BOOKING_PAYMENT_DUE_MINUTES);
    }
    return DEFAULT_BOOKING_PAYMENT_DUE_MINUTES;
  }
  resolveBookingProofUploadDueMinutes() {
    if (Number.isFinite(BOOKING_PROOF_UPLOAD_DUE_MINUTES) && BOOKING_PROOF_UPLOAD_DUE_MINUTES > 0) {
      return Math.floor(BOOKING_PROOF_UPLOAD_DUE_MINUTES);
    }
    return DEFAULT_BOOKING_PROOF_UPLOAD_DUE_MINUTES;
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
  startOfDayUTC(date) {
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
    );
  }
  endOfDayUTC(date) {
    return new Date(
      Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
        23,
        59,
        59,
        999
      )
    );
  }
  buildStayDates(checkIn, checkOut) {
    const dates = [];
    const cursor = new Date(checkIn.getTime());
    while (cursor.getTime() < checkOut.getTime()) {
      dates.push(new Date(cursor.getTime()));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return dates;
  }
  toDateKey(date) {
    return date.toISOString().slice(0, 10);
  }
  generateOrderNo() {
    return `ORD-${Date.now()}-${crypto.randomInt(1e3, 9999)}`;
  }
  async createGatewayInvoice(payload) {
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
      failureRedirectUrl
    });
  }
  async cancelPendingBookingBySystem(bookingId) {
    await this.prisma.$transaction(
      (tx) => this.cancelBookingWithInventoryRestore(tx, bookingId, CancelledBy.SYSTEM)
    );
  }
  async confirmXenditBookingPayment(bookingId, paidAt) {
    const updatedCount = await this.markXenditPaymentAsConfirmed(bookingId, paidAt);
    if (updatedCount === 0) return { message: "Webhook Xendit diterima.", bookingId, confirmed: false };
    const receiptEmailSent = await this.trySendXenditReceiptEmail(bookingId, paidAt);
    return { message: "Pembayaran Xendit berhasil dikonfirmasi otomatis.", bookingId, confirmed: true, receiptEmailSent };
  }
  async markXenditPaymentAsConfirmed(bookingId, paidAt) {
    const updated = await this.prisma.booking.updateMany({
      where: {
        id: bookingId,
        paymentMethod: PaymentMethod.XENDIT,
        status: OrderStatus.MENUNGGU_PEMBAYARAN,
        paymentConfirmedAt: null
      },
      data: { status: OrderStatus.DIPROSES, paymentConfirmedAt: paidAt, xenditInvoiceStatus: "PAID" }
    });
    return updated.count;
  }
  async trySendXenditReceiptEmail(bookingId, paidAt) {
    try {
      await this.sendApprovedBookingReceiptEmail({
        bookingId,
        approvedAt: paidAt,
        paymentMethod: PaymentMethod.XENDIT,
        reviewNotes: null
      });
      return true;
    } catch (error) {
      console.error(`[BookingService] Failed to send Xendit booking receipt email for booking ${bookingId}.`, error);
      return false;
    }
  }
  normalizeWebhookText(value) {
    if (typeof value !== "string") return null;
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }
  parseWebhookDate(value) {
    if (typeof value !== "string") return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
  }
  isXenditPaymentSettled(status) {
    return status === "PAID" || status === "SETTLED";
  }
  normalizeCallbackToken(value) {
    if (!value) return "";
    const trimmed = value.trim();
    if (!trimmed) return "";
    if (trimmed.toLowerCase().startsWith("bearer ")) {
      return trimmed.slice(7).trim();
    }
    return trimmed;
  }
  async sendTenantCancelledBookingEmail(payload) {
    const booking = await this.findBookingForTenantCancellationEmail(payload.bookingId);
    if (!booking) {
      console.warn(`[BookingService] Booking ${payload.bookingId} not found while preparing tenant cancellation email.`);
      return;
    }
    await sendBookingCancelledByTenantEmail(
      this.toTenantCancelledBookingEmailPayload(booking)
    );
  }
  findBookingForTenantCancellationEmail(bookingId) {
    return this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: TENANT_CANCELLED_BOOKING_EMAIL_SELECT
    });
  }
  toTenantCancelledBookingEmailPayload(booking) {
    return {
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
      cancelledAt: booking.cancelledAt ?? /* @__PURE__ */ new Date(),
      tenantName: booking.tenant.tenantProfile?.displayName ?? booking.tenant.email
    };
  }
  async sendApprovedBookingReceiptEmail(payload) {
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
                fullName: true
              }
            }
          }
        },
        tenant: {
          select: {
            email: true,
            tenantProfile: {
              select: {
                displayName: true
              }
            }
          }
        },
        property: {
          select: {
            name: true
          }
        },
        roomType: {
          select: {
            name: true
          }
        }
      }
    });
    if (!booking) {
      console.warn(
        `[BookingService] Booking ${payload.bookingId} not found while preparing receipt email.`
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
      tenantName: booking.tenant.tenantProfile?.displayName ?? booking.tenant.email,
      reviewNotes: payload.reviewNotes
    });
  }
  async getTenantProof(tenantAccountId, paymentProofId) {
    const proof = await this.prisma.paymentProof.findUnique({
      where: { id: paymentProofId },
      select: {
        id: true,
        bookingId: true,
        status: true,
        booking: {
          select: {
            tenantId: true
          }
        }
      }
    });
    if (!proof) {
      throw new ApiError("Bukti pembayaran tidak ditemukan.", 404);
    }
    if (proof.booking.tenantId !== tenantAccountId) {
      throw new ApiError("Forbidden.", 403);
    }
    return proof;
  }
  normalizeReviewNotes(notes) {
    const clean = notes?.trim();
    return clean ? clean : null;
  }
  roundCurrencyAmount(value) {
    return value.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
  }
  serializePricing(pricing) {
    return {
      currency: pricing.currency,
      roomSubtotal: pricing.roomSubtotal.toString(),
      breakfast: this.serializeBreakfastPricing(pricing),
      subtotal: pricing.subtotalAmount.toString(),
      appFeeRate: pricing.appFeeRate.toString(),
      appFeeAmount: pricing.appFeeAmount.toString(),
      taxRate: pricing.taxRate.toString(),
      taxAmount: pricing.taxAmount.toString(),
      tenantFeeRate: pricing.tenantFeeRate.toString(),
      tenantFeeAmount: pricing.tenantFeeAmount.toString(),
      tenantPayoutAmount: pricing.tenantPayoutAmount.toString(),
      totalAmount: pricing.totalAmount.toString()
    };
  }
  serializeBreakfastPricing(pricing) {
    return {
      selected: pricing.breakfastSelected,
      pax: pricing.breakfastPax,
      unitPrice: pricing.breakfastUnitPrice.toString(),
      nights: pricing.breakfastNights,
      total: pricing.breakfastTotal.toString()
    };
  }
  getJakartaDateKey(offsetDays) {
    const { year, month, day } = this.getJakartaDateParts();
    const baseUtcDate = new Date(Date.UTC(year, month - 1, day));
    baseUtcDate.setUTCDate(baseUtcDate.getUTCDate() + offsetDays);
    return baseUtcDate.toISOString().slice(0, 10);
  }
  getJakartaDateParts() {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });
    const dateParts = formatter.formatToParts(/* @__PURE__ */ new Date());
    const readPart = (type, fallback) => Number(dateParts.find((part) => part.type === type)?.value ?? fallback);
    return { year: readPart("year", "1970"), month: readPart("month", "01"), day: readPart("day", "01") };
  }
}
export {
  BookingService
};
