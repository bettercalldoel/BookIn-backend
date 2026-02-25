import { Router } from "express";
import { AccountType } from "@prisma/client";
import { ValidationMiddleware } from "../../middlewares/validation.middleware.js";
import { AuthMiddleware } from "../../middlewares/auth.middleware.js";
import { AvailabilityController } from "./availability.controller.js";
import { RoomTypeIdParamDTO } from "./dto/room-type-id.dto.js";
import { RoomAvailabilityQueryDTO } from "./dto/room-availability-query.dto.js";
import { UpdateRoomAvailabilityDTO } from "./dto/room-availability.dto.js";
import { CreateRateRuleDTO } from "./dto/create-rate-rule.dto.js";
import { UpdateRateRuleDTO } from "./dto/update-rate-rule.dto.js";
import { RateRuleIdParamDTO } from "./dto/rate-rule-id.dto.js";
import { ListRateRuleQueryDTO } from "./dto/list-rate-rule-query.dto.js";

export class AvailabilityRouter {
  private router: Router;

  constructor(
    private availabilityController: AvailabilityController,
    private validationMiddleware: ValidationMiddleware,
    private authMiddleware: AuthMiddleware,
  ) {
    this.router = Router();
    this.initializeRoutes();
  }

  private initializeRoutes = function (this: AvailabilityRouter) {
    this.router.get(
      "/public/room-types/:id",
      this.validationMiddleware.validateParams(RoomTypeIdParamDTO),
      this.validationMiddleware.validateQuery(RoomAvailabilityQueryDTO),
      this.availabilityController.listPublicRoomCalendar,
    );

    this.router.get(
      "/room-types/:id",
      this.authMiddleware.requireAuth,
      this.authMiddleware.requireVerifiedAccount,
      this.authMiddleware.requireAccountType(AccountType.TENANT),
      this.validationMiddleware.validateParams(RoomTypeIdParamDTO),
      this.validationMiddleware.validateQuery(RoomAvailabilityQueryDTO),
      this.availabilityController.listRoomCalendar,
    );

    this.router.put(
      "/room-types/:id",
      this.authMiddleware.requireAuth,
      this.authMiddleware.requireVerifiedAccount,
      this.authMiddleware.requireAccountType(AccountType.TENANT),
      this.validationMiddleware.validateParams(RoomTypeIdParamDTO),
      this.validationMiddleware.validateBody(UpdateRoomAvailabilityDTO),
      this.availabilityController.updateRoomAvailability,
    );

    this.router.post(
      "/rate-rules",
      this.authMiddleware.requireAuth,
      this.authMiddleware.requireVerifiedAccount,
      this.authMiddleware.requireAccountType(AccountType.TENANT),
      this.validationMiddleware.validateBody(CreateRateRuleDTO),
      this.availabilityController.createRateRule,
    );

    this.router.get(
      "/rate-rules",
      this.authMiddleware.requireAuth,
      this.authMiddleware.requireVerifiedAccount,
      this.authMiddleware.requireAccountType(AccountType.TENANT),
      this.validationMiddleware.validateQuery(ListRateRuleQueryDTO),
      this.availabilityController.listRateRules,
    );

    this.router.patch(
      "/rate-rules/:id",
      this.authMiddleware.requireAuth,
      this.authMiddleware.requireVerifiedAccount,
      this.authMiddleware.requireAccountType(AccountType.TENANT),
      this.validationMiddleware.validateParams(RateRuleIdParamDTO),
      this.validationMiddleware.validateBody(UpdateRateRuleDTO),
      this.availabilityController.updateRateRule,
    );

    this.router.delete(
      "/rate-rules/:id",
      this.authMiddleware.requireAuth,
      this.authMiddleware.requireVerifiedAccount,
      this.authMiddleware.requireAccountType(AccountType.TENANT),
      this.validationMiddleware.validateParams(RateRuleIdParamDTO),
      this.availabilityController.deleteRateRule,
    );
  };

  getRouter = () => {
    return this.router;
  };
}
