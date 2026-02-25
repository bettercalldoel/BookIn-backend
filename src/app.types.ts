import { AuthMiddleware } from "./middlewares/auth.middleware.js";
import { ValidationMiddleware } from "./middlewares/validation.middleware.js";
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

export type AppServices = {
  authService: AuthService;
  availabilityService: AvailabilityService;
  bookingService: BookingService;
  catalogService: CatalogService;
  mediaService: MediaService;
  propertyService: PropertyService;
};

export type AppControllers = {
  authController: AuthController;
  availabilityController: AvailabilityController;
  bookingController: BookingController;
  catalogController: CatalogController;
  mediaController: MediaController;
  propertyController: PropertyController;
};

export type AppMiddlewares = {
  validationMiddleware: ValidationMiddleware;
  authMiddleware: AuthMiddleware;
};

export type AppRouters = {
  authRouter: AuthRouter;
  availabilityRouter: AvailabilityRouter;
  bookingRouter: BookingRouter;
  catalogRouter: CatalogRouter;
  mediaRouter: MediaRouter;
  propertyRouter: PropertyRouter;
};
