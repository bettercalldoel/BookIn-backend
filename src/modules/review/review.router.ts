import { Router } from "express";
import { ValidationMiddleware } from "../../middlewares/validation.middleware.js";
import { ReviewController } from "./review.controller.js";
import { CreateReviewDTO } from "./dto/create-review.dto.js";
import { ReplyReviewDTO } from "./dto/reply-review.dto.js";

export class ReviewRouter {
  private router: Router;

  constructor(
    private reviewController: ReviewController,
    private validationMiddleware: ValidationMiddleware,
  ) {
    this.router = Router();
    this.initRoutes();
  }

  private initRoutes() {
    // User creates review (after checkout)
    this.router.post(
      "/bookings/:bookingId/reviews",
      this.validationMiddleware.validateBody(CreateReviewDTO),
      this.reviewController.create,
    );

    // Tenant replies to review
    this.router.patch(
      "/reviews/:id/reply",
      this.validationMiddleware.validateBody(ReplyReviewDTO),
      this.reviewController.reply,
    );
  }

  getRouter() {
    return this.router;
  }
}
