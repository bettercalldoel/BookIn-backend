import { Router } from "express";
import { AccountType } from "@prisma/client";
import { ValidationMiddleware } from "../../middlewares/validation.middleware.js";
import { AuthMiddleware } from "../../middlewares/auth.middleware.js";
import { PropertyController } from "./property.controller.js";
import { CreatePropertyDTO } from "./dto/create-property.dto.js";
import { UpdatePropertyDTO } from "./dto/update-property.dto.js";
import { PropertyIdParamDTO } from "./dto/property-id.dto.js";
import { CreateRoomDTO } from "./dto/create-room.dto.js";
import { UpdateRoomDTO } from "./dto/update-room.dto.js";
import { RoomIdParamDTO } from "./dto/room-id.dto.js";
import { SearchPropertyQueryDTO } from "./dto/search-property.dto.js";
import { ListPublicCityQueryDTO } from "./dto/list-public-city-query.dto.js";
import { ListPropertyQueryDTO } from "./dto/list-property-query.dto.js";
import { UpdatePropertyBreakfastDTO } from "./dto/update-breakfast.dto.js";

export class PropertyRouter {
  private router: Router;

  constructor(
    private propertyController: PropertyController,
    private validationMiddleware: ValidationMiddleware,
    private authMiddleware: AuthMiddleware,
  ) {
    this.router = Router();
    this.initializeRoutes();
  }

  private initializeRoutes = function (this: PropertyRouter) {
    this.router.get(
      "/categories",
      this.propertyController.listPublicCategories,
    );

    this.router.get(
      "/cities",
      this.validationMiddleware.validateQuery(ListPublicCityQueryDTO),
      this.propertyController.listPublicCities,
    );

    this.router.get(
      "/search",
      this.validationMiddleware.validateQuery(SearchPropertyQueryDTO),
      this.propertyController.listPublicProperties,
    );

    this.router.get(
      "/public/:id",
      this.validationMiddleware.validateParams(PropertyIdParamDTO),
      this.propertyController.getPublicProperty,
    );

    this.router.get(
      "/",
      this.authMiddleware.requireAuth,
      this.authMiddleware.requireVerifiedAccount,
      this.authMiddleware.requireAccountType(AccountType.TENANT),
      this.validationMiddleware.validateQuery(ListPropertyQueryDTO),
      this.propertyController.listProperties,
    );

    this.router.post(
      "/:id/rooms",
      this.authMiddleware.requireAuth,
      this.authMiddleware.requireVerifiedAccount,
      this.authMiddleware.requireAccountType(AccountType.TENANT),
      this.validationMiddleware.validateParams(PropertyIdParamDTO),
      this.validationMiddleware.validateBody(CreateRoomDTO),
      this.propertyController.createRoom,
    );

    this.router.patch(
      "/rooms/:id",
      this.authMiddleware.requireAuth,
      this.authMiddleware.requireVerifiedAccount,
      this.authMiddleware.requireAccountType(AccountType.TENANT),
      this.validationMiddleware.validateParams(RoomIdParamDTO),
      this.validationMiddleware.validateBody(UpdateRoomDTO),
      this.propertyController.updateRoom,
    );

    this.router.delete(
      "/rooms/:id",
      this.authMiddleware.requireAuth,
      this.authMiddleware.requireVerifiedAccount,
      this.authMiddleware.requireAccountType(AccountType.TENANT),
      this.validationMiddleware.validateParams(RoomIdParamDTO),
      this.propertyController.deleteRoom,
    );

    this.router.post(
      "/",
      this.authMiddleware.requireAuth,
      this.authMiddleware.requireVerifiedAccount,
      this.authMiddleware.requireAccountType(AccountType.TENANT),
      this.validationMiddleware.validateBody(CreatePropertyDTO),
      this.propertyController.createProperty,
    );

    this.router.patch(
      "/:id/breakfast",
      this.authMiddleware.requireAuth,
      this.authMiddleware.requireVerifiedAccount,
      this.authMiddleware.requireAccountType(AccountType.TENANT),
      this.validationMiddleware.validateParams(PropertyIdParamDTO),
      this.validationMiddleware.validateBody(UpdatePropertyBreakfastDTO),
      this.propertyController.updatePropertyBreakfast,
    );

    this.router.patch(
      "/:id",
      this.authMiddleware.requireAuth,
      this.authMiddleware.requireVerifiedAccount,
      this.authMiddleware.requireAccountType(AccountType.TENANT),
      this.validationMiddleware.validateParams(PropertyIdParamDTO),
      this.validationMiddleware.validateBody(UpdatePropertyDTO),
      this.propertyController.updateProperty,
    );

    this.router.delete(
      "/:id",
      this.authMiddleware.requireAuth,
      this.authMiddleware.requireVerifiedAccount,
      this.authMiddleware.requireAccountType(AccountType.TENANT),
      this.validationMiddleware.validateParams(PropertyIdParamDTO),
      this.propertyController.deleteProperty,
    );
  };

  getRouter = () => {
    return this.router;
  };
}
