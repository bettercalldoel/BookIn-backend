import { Router } from "express";
import { BookingController } from "./booking.controller.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import {
  validateBody,
  validateQuery,
} from "../../middlewares/validation.middleware.js";

import { CreateBookingDTO } from "./dto/create-booking.dto.js";
import { ListBookingDTO } from "./dto/list-booking.dto.js";
import { CancelBookingDTO } from "./dto/cancel-booking.dto.js";

const router = Router();

/**
 * LIST BOOKINGS
 * GET /api/bookings
 */
router.get(
  "/",
  authMiddleware,
  validateQuery(ListBookingDTO),
  BookingController.list,
);

/**
 * CREATE BOOKING
 * POST /api/bookings
 */
router.post(
  "/",
  authMiddleware,
  validateBody(CreateBookingDTO),
  BookingController.create,
);

/**
 * CANCEL BOOKING
 * POST /api/bookings/:id/cancel
 */
router.post(
  "/:id/cancel",
  authMiddleware,
  validateBody(CancelBookingDTO),
  BookingController.cancel,
);

export default router;
