import { Request, Response } from "express";
import { ReviewService } from "./review.service.js";

export class ReviewController {
  constructor(private reviewService: ReviewService) {}

  // User submits review
  create = async (req: Request, res: Response) => {
    const result = await this.reviewService.createReview(
      req.params.bookingId as string,
      (req as any).user.id,
      req.body,
    );

    res.status(201).send(result);
  };

  // Tenant replies
  reply = async (req: Request, res: Response) => {
    const result = await this.reviewService.replyReview(
      req.params.id as string,
      req.body.reply,
    );

    res.status(200).send(result);
  };
}
