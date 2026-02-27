import cors from "cors";
import express, { Express } from "express";
import "reflect-metadata";
import { CORS_ALLOWED_ORIGINS, PORT } from "./config/env.js";
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
import {
  AppControllers,
  AppMiddlewares,
  AppRouters,
  AppServices,
} from "./app.types.js";

export class App {
  app: Express;

  constructor() {
    this.app = express();
    this.configure();
    this.registerModules();
    this.handleError();
  }

  private configure() {
    const allowAllOrigins = CORS_ALLOWED_ORIGINS.includes("*");

    this.app.use(
      cors({
        origin: (origin, callback) => {
          if (!origin || allowAllOrigins) {
            callback(null, true);
            return;
          }

          if (this.isAllowedCorsOrigin(origin)) {
            callback(null, true);
            return;
          }

          callback(new Error(`Origin "${origin}" is not allowed by CORS.`));
        },
        exposedHeaders: ["Authorization"],
      }),
    );
    this.app.use(loggerHttp);
    this.app.use(express.json());
    this.app.get("/healthz", (_req, res) => {
      res.status(200).json({ status: "ok" });
    });
  }

  private isAllowedCorsOrigin(origin: string) {
    const parsedOrigin = this.parseOrigin(origin);
    if (!parsedOrigin) return false;

    const requestHost = parsedOrigin.hostname.toLowerCase();
    const requestOrigin = parsedOrigin.origin.toLowerCase();

    return CORS_ALLOWED_ORIGINS.some((allowedOrigin) => {
      const normalized = allowedOrigin.toLowerCase();

      if (normalized.startsWith("*.")) {
        const suffix = normalized.slice(1); // ".vercel.app"
        return requestHost.endsWith(suffix);
      }

      if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
        return requestOrigin === normalized.replace(/\/$/, "");
      }

      return requestHost === normalized;
    });
  }

  private parseOrigin(value: string) {
    try {
      return new URL(value);
    } catch {
      return null;
    }
  }

  private registerModules() {
    const services = this.createServices();
    const controllers = this.createControllers(services);
    const middlewares = this.createMiddlewares();
    const routers = this.createRouters(controllers, middlewares);
    this.mountRouters(routers);
    this.startBookingAutoCancelJob(services.bookingService);
  }

  private createServices() {
    return {
      authService: new AuthService(prisma),
      availabilityService: new AvailabilityService(prisma),
      bookingService: new BookingService(prisma),
      catalogService: new CatalogService(prisma),
      mediaService: new MediaService(),
      propertyService: new PropertyService(prisma),
    };
  }

  private createControllers(services: AppServices) {
    return {
      authController: new AuthController(services.authService),
      availabilityController: new AvailabilityController(
        services.availabilityService,
      ),
      bookingController: new BookingController(services.bookingService),
      catalogController: new CatalogController(services.catalogService),
      mediaController: new MediaController(services.mediaService),
      propertyController: new PropertyController(services.propertyService),
    };
  }

  private createMiddlewares(): AppMiddlewares {
    return {
      validationMiddleware: new ValidationMiddleware(),
      authMiddleware: new AuthMiddleware(prisma),
    };
  }

  private createRouters(
    controllers: AppControllers,
    middlewares: AppMiddlewares,
  ): AppRouters {
    return {
      authRouter: new AuthRouter(
        controllers.authController,
        middlewares.validationMiddleware,
        middlewares.authMiddleware,
      ),
      availabilityRouter: new AvailabilityRouter(
        controllers.availabilityController,
        middlewares.validationMiddleware,
        middlewares.authMiddleware,
      ),
      bookingRouter: new BookingRouter(
        controllers.bookingController,
        middlewares.validationMiddleware,
        middlewares.authMiddleware,
      ),
      catalogRouter: new CatalogRouter(
        controllers.catalogController,
        middlewares.validationMiddleware,
        middlewares.authMiddleware,
      ),
      mediaRouter: new MediaRouter(
        controllers.mediaController,
        middlewares.authMiddleware,
      ),
      propertyRouter: new PropertyRouter(
        controllers.propertyController,
        middlewares.validationMiddleware,
        middlewares.authMiddleware,
      ),
    };
  }

  private mountRouters(routers: AppRouters) {
    this.app.use("/auth", routers.authRouter.getRouter());
    this.app.use("/availability", routers.availabilityRouter.getRouter());
    this.app.use("/bookings", routers.bookingRouter.getRouter());
    this.app.use("/catalog", routers.catalogRouter.getRouter());
    this.app.use("/media", routers.mediaRouter.getRouter());
    this.app.use("/properties", routers.propertyRouter.getRouter());
  }

  private startBookingAutoCancelJob(bookingService: BookingService) {
    const run = () => this.runBookingAutoJobs(bookingService);
    void run();
    setInterval(() => void run(), 60 * 1000).unref();
  }

  private async runBookingAutoJobs(bookingService: BookingService) {
    try {
      await this.sendBookingReminderJob(bookingService);
      await this.runAutoCompleteJob(bookingService);
      await this.runAutoCancelJob(bookingService);
    } catch (error) {
      console.error(
        "[BookingJob] Failed to run booking automation jobs.",
        error,
      );
    }
  }

  private async sendBookingReminderJob(bookingService: BookingService) {
    const reminders = await bookingService.sendHMinusOneCheckInReminders();
    if (reminders.sent <= 0) return;
    console.info(
      `[BookingJob] Sent ${reminders.sent} H-1 check-in reminder email(s).`,
    );
  }

  private async runAutoCompleteJob(bookingService: BookingService) {
    const completed = await bookingService.autoCompleteFinishedBookings();
    if (completed.completed <= 0) return;
    console.info(
      `[BookingJob] Marked ${completed.completed} booking(s) as selesai.`,
    );
  }

  private async runAutoCancelJob(bookingService: BookingService) {
    const result = await bookingService.autoCancelExpiredUnpaidBookings();
    if (result.cancelled <= 0) return;
    console.info(
      `[BookingJob] Auto-cancelled ${result.cancelled} expired unpaid booking(s).`,
    );
  }

  private handleError() {
    this.app.use(errorMiddleware);
  }

  public start() {
    this.app.listen(PORT, () => {
      console.info(`Server running on port: ${PORT}`);
    });
  }
}
