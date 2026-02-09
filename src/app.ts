import cors from "cors";
import express, { Express } from "express";
import "reflect-metadata";
import { PORT } from "./config/env.js";
import { loggerHttp } from "./lib/logger-http.js";
import { prisma } from "./lib/prisma.js";
import { errorMiddleware } from "./middlewares/error.middleware.js";
import { ValidationMiddleware } from "./middlewares/validation.middleware.js";
import { AuthMiddleware } from "./middlewares/auth.middleware.js";
import { AuthController } from "./modules/auth/auth.controller.js";
import { AuthRouter } from "./modules/auth/auth.router.js";
import { AuthService } from "./modules/auth/auth.service.js";
import { AvailabilityController } from "./modules/availability/availability.controller.js";
import { AvailabilityRouter } from "./modules/availability/availability.router.js";
import { AvailabilityService } from "./modules/availability/availability.service.js";
import { BookingController } from "./modules/booking/booking.controller.js";
import { BookingRouter } from "./modules/booking/booking.router.js";
import { BookingService } from "./modules/booking/booking.service.js";
import { CatalogController } from "./modules/catalog/catalog.controller.js";
import { CatalogRouter } from "./modules/catalog/catalog.router.js";
import { CatalogService } from "./modules/catalog/catalog.service.js";
import { MediaController } from "./modules/media/media.controller.js";
import { MediaRouter } from "./modules/media/media.router.js";
import { MediaService } from "./modules/media/media.service.js";
import { PropertyController } from "./modules/property/property.controller.js";
import { PropertyRouter } from "./modules/property/property.router.js";
import { PropertyService } from "./modules/property/property.service.js";

export class App {
  app: Express;

  constructor() {
    this.app = express();
    this.configure();
    this.registerModules();
    this.handleError();
  }

  private configure() {
    this.app.use(
      cors({
        exposedHeaders: ["Authorization"],
      }),
    );
    this.app.use(loggerHttp);
    this.app.use(express.json());
  }

  private registerModules() {
    // shared dependency
    const prismaClient = prisma;

    // services
    const authService = new AuthService(prismaClient);
    const availabilityService = new AvailabilityService(prismaClient);
    const bookingService = new BookingService(prismaClient);
    const catalogService = new CatalogService(prismaClient);
    const mediaService = new MediaService();
    const propertyService = new PropertyService(prismaClient);

    // controllers
    const authController = new AuthController(authService);
    const availabilityController = new AvailabilityController(
      availabilityService,
    );
    const bookingController = new BookingController(bookingService);
    const catalogController = new CatalogController(catalogService);
    const mediaController = new MediaController(mediaService);
    const propertyController = new PropertyController(propertyService);

    // middlewares
    const validationMiddleware = new ValidationMiddleware();
    const authMiddleware = new AuthMiddleware(prismaClient);

    // routers
    const authRouter = new AuthRouter(
      authController,
      validationMiddleware,
      authMiddleware,
    );
    const availabilityRouter = new AvailabilityRouter(
      availabilityController,
      validationMiddleware,
      authMiddleware,
    );
    const bookingRouter = new BookingRouter(
      bookingController,
      validationMiddleware,
      authMiddleware,
    );
    const catalogRouter = new CatalogRouter(
      catalogController,
      validationMiddleware,
      authMiddleware,
    );
    const mediaRouter = new MediaRouter(mediaController, authMiddleware);
    const propertyRouter = new PropertyRouter(
      propertyController,
      validationMiddleware,
      authMiddleware,
    );

    this.app.use("/auth", authRouter.getRouter());
    this.app.use("/availability", availabilityRouter.getRouter());
    this.app.use("/bookings", bookingRouter.getRouter());
    this.app.use("/catalog", catalogRouter.getRouter());
    this.app.use("/media", mediaRouter.getRouter());
    this.app.use("/properties", propertyRouter.getRouter());

    this.startBookingAutoCancelJob(bookingService);
  }

  private startBookingAutoCancelJob(bookingService: BookingService) {
    const run = async () => {
      try {
        const completed = await bookingService.autoCompleteFinishedBookings();
        if (completed.completed > 0) {
          console.log(
            `[BookingJob] Marked ${completed.completed} booking(s) as selesai.`,
          );
        }

        const result = await bookingService.autoCancelExpiredUnpaidBookings();
        if (result.cancelled > 0) {
          console.log(
            `[BookingJob] Auto-cancelled ${result.cancelled} expired unpaid booking(s).`,
          );
        }
      } catch (error) {
        console.error(
          "[BookingJob] Failed to auto-cancel expired bookings.",
          error,
        );
      }
    };

    void run();
    setInterval(() => {
      void run();
    }, 60 * 1000).unref();
  }

  private handleError() {
    this.app.use(errorMiddleware);
  }

  public start() {
    this.app.listen(PORT, () => {
      console.log(`Server running on port: ${PORT}`);
    });
  }
}
