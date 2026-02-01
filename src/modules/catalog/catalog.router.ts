import { Router } from "express";
import { AccountType } from "@prisma/client";
import { AuthMiddleware } from "../../middlewares/auth.middleware.js";
import { ValidationMiddleware } from "../../middlewares/validation.middleware.js";
import { CatalogController } from "./catalog.controller.js";
import { CreateCategoryDTO } from "./dto/create-category.dto.js";

export class CatalogRouter {
  private router: Router;

  constructor(
    private catalogController: CatalogController,
    private validationMiddleware: ValidationMiddleware,
    private authMiddleware: AuthMiddleware,
  ) {
    this.router = Router();
    this.initializeRoutes();
  }

  private initializeRoutes = () => {
    this.router.get(
      "/cities",
      this.authMiddleware.requireAuth,
      this.authMiddleware.requireVerifiedAccount,
      this.authMiddleware.requireAccountType(AccountType.TENANT),
      this.catalogController.getCities,
    );

    this.router.get(
      "/categories",
      this.authMiddleware.requireAuth,
      this.authMiddleware.requireVerifiedAccount,
      this.authMiddleware.requireAccountType(AccountType.TENANT),
      this.catalogController.getCategories,
    );

    this.router.post(
      "/categories",
      this.authMiddleware.requireAuth,
      this.authMiddleware.requireVerifiedAccount,
      this.authMiddleware.requireAccountType(AccountType.TENANT),
      this.validationMiddleware.validateBody(CreateCategoryDTO),
      this.catalogController.createCategory,
    );
  };

  getRouter = () => {
    return this.router;
  };
}
