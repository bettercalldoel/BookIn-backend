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
  static create = async (req: Request, res: Response) => {
    const userId = resolveUserId(req);
    if (!userId) throw new ApiError("Unauthorized.", 401);

    const result = await BookingService.create(
      userId,
      req.body as CreateBookingDTO,
    );
    res.status(201).json(result);
  };

  static list = async (req: Request, res: Response) => {
    const userId = resolveUserId(req);
    if (!userId) throw new ApiError("Unauthorized.", 401);

    const result = await BookingService.list(
      userId,
      req.query as unknown as ListBookingDTO,
    );
    res.status(200).json(result);
  };

  static cancel = async (req: Request, res: Response) => {
    const bookingId = String(req.params.id ?? "");
    if (!bookingId) throw new ApiError("Booking ID required.", 400);

    const { cancelledBy } = req.body as CancelBookingDTO;
    const result = await BookingService.cancel(bookingId, cancelledBy);
    res.status(200).json(result);
  };
}
