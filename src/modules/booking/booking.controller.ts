import { Request, Response } from "express";
import { BookingService } from "./booking.service.js";
import { CreateBookingDTO } from "./dto/create-booking.dto.js";
import { ListBookingDTO } from "./dto/list-booking.dto.js";
import { CancelBookingDTO } from "./dto/cancel-booking.dto.js";
import { ListTenantPaymentProofDTO } from "./dto/list-tenant-payment-proof.dto.js";
import { ReviewPaymentProofDTO } from "./dto/review-payment-proof.dto.js";
import { CreateReviewDTO } from "./dto/create-review.dto.js";
import { ReplyReviewDTO } from "./dto/reply-review.dto.js";
import { ListTenantReviewDTO } from "./dto/list-tenant-review.dto.js";
import { ApiError } from "../../utils/api-error.js";

const resolveUserId = (req: Request) => {
  const user = req.user as { sub?: string; id?: string } | undefined;
  return user?.sub ?? user?.id ?? "";
};

export class BookingController {
  constructor(private bookingService: BookingService) {}

  create = async (req: Request, res: Response) => {
    const userId = resolveUserId(req);
    if (!userId) throw new ApiError("Unauthorized.", 401);

    const result = await this.bookingService.create(
      userId,
      req.body as CreateBookingDTO,
    );
    res.status(201).json(result);
  };

  preview = async (req: Request, res: Response) => {
    const userId = resolveUserId(req);
    if (!userId) throw new ApiError("Unauthorized.", 401);

    const result = await this.bookingService.preview(
      userId,
      req.body as CreateBookingDTO,
    );
    res.status(200).json(result);
  };

  xenditWebhook = async (req: Request, res: Response) => {
    const callbackHeader = req.headers["x-callback-token"];
    const callbackToken = Array.isArray(callbackHeader)
      ? callbackHeader[0]
      : callbackHeader;

    const result = await this.bookingService.processXenditWebhook(
      callbackToken,
      req.body as Record<string, unknown>,
    );
    res.status(200).json(result);
  };

  list = async (req: Request, res: Response) => {
    const userId = resolveUserId(req);
    if (!userId) throw new ApiError("Unauthorized.", 401);

    const result = await this.bookingService.list(
      userId,
      req.query as unknown as ListBookingDTO,
    );
    res.status(200).json(result);
  };

  options = async (_req: Request, res: Response) => {
    const result = await this.bookingService.listOptions();
    res.status(200).json(result);
  };

  cancel = async (req: Request, res: Response) => {
    const userId = resolveUserId(req);
    if (!userId) throw new ApiError("Unauthorized.", 401);

    const bookingId = String(req.params.id ?? "");
    if (!bookingId) throw new ApiError("Booking ID required.", 400);

    const { cancelledBy } = req.body as CancelBookingDTO;
    const result = await this.bookingService.cancelByUser(
      userId,
      bookingId,
      cancelledBy,
    );
    res.status(200).json(result);
  };

  createReview = async (req: Request, res: Response) => {
    const userId = resolveUserId(req);
    if (!userId) throw new ApiError("Unauthorized.", 401);

    const bookingId = String(req.params.id ?? "");
    if (!bookingId) throw new ApiError("Booking ID required.", 400);

    const result = await this.bookingService.createReview(
      userId,
      bookingId,
      req.body as CreateReviewDTO,
    );

    res.status(201).json(result);
  };

  uploadPaymentProof = async (req: Request, res: Response) => {
    const userId = resolveUserId(req);
    if (!userId) throw new ApiError("Unauthorized.", 401);

    const bookingId = String(req.params.id ?? "");
    if (!bookingId) throw new ApiError("Booking ID required.", 400);

    if (!req.file) {
      throw new ApiError("Payment proof file is required.", 400);
    }

    const result = await this.bookingService.uploadPaymentProof(
      userId,
      bookingId,
      req.file,
    );
    res.status(200).json(result);
  };

  listTenantPaymentProofs = async (req: Request, res: Response) => {
    const tenantAccountId = resolveUserId(req);
    if (!tenantAccountId) throw new ApiError("Unauthorized.", 401);

    const result = await this.bookingService.listTenantPaymentProofs(
      tenantAccountId,
      req.query as unknown as ListTenantPaymentProofDTO,
    );

    res.status(200).json(result);
  };

  listTenantReviews = async (req: Request, res: Response) => {
    const tenantAccountId = resolveUserId(req);
    if (!tenantAccountId) throw new ApiError("Unauthorized.", 401);

    const result = await this.bookingService.listTenantReviews(
      tenantAccountId,
      req.query as unknown as ListTenantReviewDTO,
    );

    res.status(200).json(result);
  };

  replyReview = async (req: Request, res: Response) => {
    const tenantAccountId = resolveUserId(req);
    if (!tenantAccountId) throw new ApiError("Unauthorized.", 401);

    const reviewId = String(req.params.id ?? "");
    if (!reviewId) throw new ApiError("Review ID required.", 400);

    const result = await this.bookingService.replyReview(
      tenantAccountId,
      reviewId,
      req.body as ReplyReviewDTO,
    );

    res.status(200).json(result);
  };

  approvePaymentProof = async (req: Request, res: Response) => {
    const tenantAccountId = resolveUserId(req);
    if (!tenantAccountId) throw new ApiError("Unauthorized.", 401);

    const paymentProofId = String(req.params.id ?? "");
    if (!paymentProofId) throw new ApiError("Payment proof ID required.", 400);

    const result = await this.bookingService.approvePaymentProof(
      tenantAccountId,
      paymentProofId,
      req.body as ReviewPaymentProofDTO,
    );
    res.status(200).json(result);
  };

  rejectPaymentProof = async (req: Request, res: Response) => {
    const tenantAccountId = resolveUserId(req);
    if (!tenantAccountId) throw new ApiError("Unauthorized.", 401);

    const paymentProofId = String(req.params.id ?? "");
    if (!paymentProofId) throw new ApiError("Payment proof ID required.", 400);

    const result = await this.bookingService.rejectPaymentProof(
      tenantAccountId,
      paymentProofId,
      req.body as ReviewPaymentProofDTO,
    );

    res.status(200).json(result);
  };
}
