import { Router } from "express";
import { ValidationMiddleware } from "../../middlewares/validation.middleware.js";
import { CreateSampleDTO } from "./dto/create-sample.dto.js";
import { SampleController } from "./sample.controller.js";

export class SampleRouter {
  private router: Router;

  constructor(
    private sampleController: SampleController,
    private validationMiddleware: ValidationMiddleware,
  ) {
    this.router = Router();
    this.initializedRoutes();
  }

  private initializedRoutes = () => {
    this.router.get("/", this.sampleController.getSamples);
    this.router.post(
      "/",
      this.validationMiddleware.validateBody(CreateSampleDTO),
      this.sampleController.createSample,
    );
  };

  getRouter = () => {
    return this.router;
  };
}
