import { Router } from "express";
import { AccountType } from "@prisma/client";
import { ValidationMiddleware } from "../../middlewares/validation.middleware.js";
import { AuthMiddleware } from "../../middlewares/auth.middleware.js";
import { PropertyController } from "./property.controller.js";
import { CreatePropertyDTO } from "./dto/create-property.dto.js";

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

  private initializeRoutes = () => {
    this.router.post(
      "/",
      this.authMiddleware.requireAuth,
      this.authMiddleware.requireVerifiedAccount,
      this.authMiddleware.requireAccountType(AccountType.TENANT),
      this.validationMiddleware.validateBody(CreatePropertyDTO),
      this.propertyController.createProperty,
    );
  };

  getRouter = () => {
    return this.router;
  };
}
