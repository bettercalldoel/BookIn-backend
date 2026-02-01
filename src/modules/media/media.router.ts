import { Router } from "express";
import { AccountType } from "@prisma/client";
import { AuthMiddleware } from "../../middlewares/auth.middleware.js";
import { MediaController } from "./media.controller.js";

export class MediaRouter {
  private router: Router;

  constructor(
    private mediaController: MediaController,
    private authMiddleware: AuthMiddleware,
  ) {
    this.router = Router();
    this.initializeRoutes();
  }

  private initializeRoutes = () => {
    this.router.get(
      "/signature",
      this.authMiddleware.requireAuth,
      this.authMiddleware.requireVerifiedAccount,
      this.authMiddleware.requireAccountType(AccountType.TENANT),
      this.mediaController.getSignature,
    );

    this.router.get(
      "/profile-signature",
      this.authMiddleware.requireAuth,
      this.mediaController.getProfileSignature,
    );
  };

  getRouter = () => {
    return this.router;
  };
}
