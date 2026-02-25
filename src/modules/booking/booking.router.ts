import { Router } from "express";
import { AccountType } from "@prisma/client";
import { BookingController } from "./booking.controller.js";
import { AuthMiddleware } from "../../middlewares/auth.middleware.js";
import { ValidationMiddleware } from "../../middlewares/validation.middleware.js";
import { CreateBookingDTO } from "./dto/create-booking.dto.js";
import { ListBookingDTO } from "./dto/list-booking.dto.js";
import { CancelBookingDTO } from "./dto/cancel-booking.dto.js";
import { BookingIdParamDTO } from "./dto/booking-id.dto.js";
import { ListTenantPaymentProofDTO } from "./dto/list-tenant-payment-proof.dto.js";
import { PaymentProofIdParamDTO } from "./dto/payment-proof-id.dto.js";
import { CreateReviewDTO } from "./dto/create-review.dto.js";
import { ReplyReviewDTO } from "./dto/reply-review.dto.js";
import { ListTenantReviewDTO } from "./dto/list-tenant-review.dto.js";
import { ReviewIdParamDTO } from "./dto/review-id.dto.js";
import { ListBookingOptionDTO } from "./dto/list-booking-option.dto.js";
import { ListTenantSalesReportDTO } from "./dto/list-tenant-sales-report.dto.js";
import { uploadImage } from "../../lib/multer.js";

export class BookingRouter {
  private router: Router;

  constructor(
    private bookingController: BookingController,
    private validationMiddleware: ValidationMiddleware,
    private authMiddleware: AuthMiddleware,
  ) {
    this.router = Router();
    this.initializeRoutes();
  }

  private initializeRoutes = function (this: BookingRouter) {
    this.router.post(
      "/payment-gateway/xendit/webhook",
      this.bookingController.xenditWebhook,
    );

    this.router.get(
      "/",
      this.authMiddleware.requireAuth,
      this.authMiddleware.requireVerifiedAccount,
      this.authMiddleware.requireAccountType(AccountType.USER),
      this.validationMiddleware.validateQuery(ListBookingDTO),
      this.bookingController.list,
    );

    this.router.get(
      "/options",
      this.authMiddleware.requireAuth,
      this.authMiddleware.requireVerifiedAccount,
      this.authMiddleware.requireAccountType(AccountType.USER),
      this.validationMiddleware.validateQuery(ListBookingOptionDTO),
      this.bookingController.options,
    );

    this.router.post(
      "/preview",
      this.authMiddleware.requireAuth,
      this.authMiddleware.requireVerifiedAccount,
      this.authMiddleware.requireAccountType(AccountType.USER),
      this.validationMiddleware.validateBody(CreateBookingDTO),
      this.bookingController.preview,
    );

    this.router.post(
      "/",
      this.authMiddleware.requireAuth,
      this.authMiddleware.requireVerifiedAccount,
      this.authMiddleware.requireAccountType(AccountType.USER),
      this.validationMiddleware.validateBody(CreateBookingDTO),
      this.bookingController.create,
    );

    this.router.get(
      "/tenant/payment-proofs",
      this.authMiddleware.requireAuth,
      this.authMiddleware.requireVerifiedAccount,
      this.authMiddleware.requireAccountType(AccountType.TENANT),
      this.validationMiddleware.validateQuery(ListTenantPaymentProofDTO),
      this.bookingController.listTenantPaymentProofs,
    );

    this.router.get(
      "/tenant/reports/sales",
      this.authMiddleware.requireAuth,
      this.authMiddleware.requireVerifiedAccount,
      this.authMiddleware.requireAccountType(AccountType.TENANT),
      this.validationMiddleware.validateQuery(ListTenantSalesReportDTO),
      this.bookingController.listTenantSalesReport,
    );

    this.router.get(
      "/tenant/reviews",
      this.authMiddleware.requireAuth,
      this.authMiddleware.requireVerifiedAccount,
      this.authMiddleware.requireAccountType(AccountType.TENANT),
      this.validationMiddleware.validateQuery(ListTenantReviewDTO),
      this.bookingController.listTenantReviews,
    );

    this.router.post(
      "/tenant/reviews/:id/reply",
      this.authMiddleware.requireAuth,
      this.authMiddleware.requireVerifiedAccount,
      this.authMiddleware.requireAccountType(AccountType.TENANT),
      this.validationMiddleware.validateParams(ReviewIdParamDTO),
      this.validationMiddleware.validateBody(ReplyReviewDTO),
      this.bookingController.replyReview,
    );

    this.router.post(
      "/tenant/:id/cancel",
      this.authMiddleware.requireAuth,
      this.authMiddleware.requireVerifiedAccount,
      this.authMiddleware.requireAccountType(AccountType.TENANT),
      this.validationMiddleware.validateParams(BookingIdParamDTO),
      this.bookingController.cancelByTenant,
    );

    this.router.post(
      "/tenant/payment-proofs/:id/approve",
      this.authMiddleware.requireAuth,
      this.authMiddleware.requireVerifiedAccount,
      this.authMiddleware.requireAccountType(AccountType.TENANT),
      this.validationMiddleware.validateParams(PaymentProofIdParamDTO),
      this.bookingController.approvePaymentProof,
    );

    this.router.post(
      "/tenant/payment-proofs/:id/reject",
      this.authMiddleware.requireAuth,
      this.authMiddleware.requireVerifiedAccount,
      this.authMiddleware.requireAccountType(AccountType.TENANT),
      this.validationMiddleware.validateParams(PaymentProofIdParamDTO),
      this.bookingController.rejectPaymentProof,
    );

    this.router.post(
      "/:id/review",
      this.authMiddleware.requireAuth,
      this.authMiddleware.requireVerifiedAccount,
      this.authMiddleware.requireAccountType(AccountType.USER),
      this.validationMiddleware.validateParams(BookingIdParamDTO),
      this.validationMiddleware.validateBody(CreateReviewDTO),
      this.bookingController.createReview,
    );

    this.router.post(
      "/:id/cancel",
      this.authMiddleware.requireAuth,
      this.authMiddleware.requireVerifiedAccount,
      this.authMiddleware.requireAccountType(AccountType.USER),
      this.validationMiddleware.validateParams(BookingIdParamDTO),
      this.validationMiddleware.validateBody(CancelBookingDTO),
      this.bookingController.cancel,
    );

    this.router.post(
      "/:id/payment-proof",
      this.authMiddleware.requireAuth,
      this.authMiddleware.requireVerifiedAccount,
      this.authMiddleware.requireAccountType(AccountType.USER),
      this.validationMiddleware.validateParams(BookingIdParamDTO),
      uploadImage.single("proof"),
      this.bookingController.uploadPaymentProof,
    );
  };

  getRouter = () => {
    return this.router;
  };
}
