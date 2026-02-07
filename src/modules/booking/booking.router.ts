import { Router } from "express";
import { AccountType } from "@prisma/client";
import { BookingController } from "./booking.controller.js";
import { AuthMiddleware } from "../../middlewares/auth.middleware.js";
import { ValidationMiddleware } from "../../middlewares/validation.middleware.js";
import { CreateBookingDTO } from "./dto/create-booking.dto.js";
import { ListBookingDTO } from "./dto/list-booking.dto.js";
import { CancelBookingDTO } from "./dto/cancel-booking.dto.js";
import { BookingIdParamDTO } from "./dto/booking-id.dto.js";
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

  private initializeRoutes = () => {
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
      uploadImage.single("proof"),
      this.bookingController.uploadPaymentProof,
    );
  };

  getRouter = () => {
    return this.router;
  };
}
