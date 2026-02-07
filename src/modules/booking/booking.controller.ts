import { Request, Response } from "express";
import { BookingService } from "./booking.service.js";
import { CreateBookingDTO } from "./dto/create-booking.dto.js";
import { ListBookingDTO } from "./dto/list-booking.dto.js";
import { CancelBookingDTO } from "./dto/cancel-booking.dto.js";
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
    const bookingId = String(req.params.id ?? "");
    if (!bookingId) throw new ApiError("Booking ID required.", 400);

    const { cancelledBy } = req.body as CancelBookingDTO;
    const result = await this.bookingService.cancel(bookingId, cancelledBy);
    res.status(200).json(result);
  };

  uploadPaymentProof = async (req: Request, res: Response) => {
    const bookingId = String(req.params.id ?? "");
    if (!bookingId) throw new ApiError("Booking ID required.", 400);

    if (!req.file) {
      throw new ApiError("Payment proof file is required.", 400);
    }
    const result = this.bookingService.uploadPaymentProof(bookingId, req.file);
    res.status(200).json(result);
  };
}
