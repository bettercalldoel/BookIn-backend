import { Router } from "express";
import { AccountType } from "@prisma/client";
import { AuthMiddleware } from "../../middlewares/auth.middleware.js";
import { ValidationMiddleware } from "../../middlewares/validation.middleware.js";
import { CatalogController } from "./catalog.controller.js";
import { CatalogQueryDTO } from "./dto/catalog-query.dto.js";
import { CreateCategoryDTO } from "./dto/create-category.dto.js";
import { UpdateCategoryDTO } from "./dto/update-category.dto.js";
import { CategoryIdParamDTO } from "./dto/category-id.dto.js";

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

  private tenantAccessMiddlewares = () => [
    this.authMiddleware.requireAuth,
    this.authMiddleware.requireVerifiedAccount,
    this.authMiddleware.requireAccountType(AccountType.TENANT),
  ];

  private registerCitiesRoute = () => {
    this.router.get(
      "/cities",
      ...this.tenantAccessMiddlewares(),
      this.validationMiddleware.validateQuery(CatalogQueryDTO),
      this.catalogController.getCities,
    );
  };

  private registerGetCategoriesRoute = () => {
    this.router.get(
      "/categories",
      ...this.tenantAccessMiddlewares(),
      this.validationMiddleware.validateQuery(CatalogQueryDTO),
      this.catalogController.getCategories,
    );
  };

  private registerCreateCategoryRoute = () => {
    this.router.post(
      "/categories",
      ...this.tenantAccessMiddlewares(),
      this.validationMiddleware.validateBody(CreateCategoryDTO),
      this.catalogController.createCategory,
    );
  };

  private registerUpdateCategoryRoute = () => {
    this.router.patch(
      "/categories/:id",
      ...this.tenantAccessMiddlewares(),
      this.validationMiddleware.validateParams(CategoryIdParamDTO),
      this.validationMiddleware.validateBody(UpdateCategoryDTO),
      this.catalogController.updateCategory,
    );
  };

  private registerDeleteCategoryRoute = () => {
    this.router.delete(
      "/categories/:id",
      ...this.tenantAccessMiddlewares(),
      this.validationMiddleware.validateParams(CategoryIdParamDTO),
      this.catalogController.deleteCategory,
    );
  };

  private registerCategoryRoutes = () => {
    this.registerGetCategoriesRoute();
    this.registerCreateCategoryRoute();
    this.registerUpdateCategoryRoute();
    this.registerDeleteCategoryRoute();
  };

  private initializeRoutes = () => {
    this.registerCitiesRoute();
    this.registerCategoryRoutes();
  };

  getRouter = () => {
    return this.router;
  };
}
