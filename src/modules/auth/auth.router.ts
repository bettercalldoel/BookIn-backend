import { Router } from "express";
import { ValidationMiddleware } from "../../middlewares/validation.middleware.js";
import { AuthController } from "./auth.controller.js";
import { AuthMiddleware } from "../../middlewares/auth.middleware.js";
import { LoginDTO } from "./dto/login.dto.js";
import { LoginGoogleDTO } from "./dto/login-google.dto.js";
import { LoginSocialDTO } from "./dto/login-social.dto.js";
import { RegisterSocialDTO } from "./dto/register-social.dto.js";
import { RegisterTenantDTO } from "./dto/register-tenant.dto.js";
import { RegisterUserDTO } from "./dto/register-user.dto.js";
import { RequestPasswordResetDTO } from "./dto/request-password-reset.dto.js";
import { ResendVerificationDTO } from "./dto/resend-verification.dto.js";
import { ConfirmPasswordResetDTO } from "./dto/confirm-password-reset.dto.js";
import { UpdateEmailDTO } from "./dto/update-email.dto.js";
import { UpdatePasswordDTO } from "./dto/update-password.dto.js";
import { UpdateProfileDTO } from "./dto/update-profile.dto.js";
import { VerifyEmailDTO } from "./dto/verify-email.dto.js";

export class AuthRouter {
  private router: Router;

  constructor(
    private authController: AuthController,
    private validationMiddleware: ValidationMiddleware,
    private authMiddleware: AuthMiddleware,
  ) {
    this.router = Router();
    this.initializeRoutes();
  }

  private initializeRoutes = function (this: AuthRouter) {
    this.router.post(
      "/register/user",
      this.validationMiddleware.validateBody(RegisterUserDTO),
      this.authController.registerUser,
    );

    this.router.post(
      "/register/tenant",
      this.validationMiddleware.validateBody(RegisterTenantDTO),
      this.authController.registerTenant,
    );

    this.router.post(
      "/register/social",
      this.validationMiddleware.validateBody(RegisterSocialDTO),
      this.authController.registerSocial,
    );

    this.router.post(
      "/login",
      this.validationMiddleware.validateBody(LoginDTO),
      this.authController.login,
    );

    this.router.post(
      "/login/social",
      this.validationMiddleware.validateBody(LoginSocialDTO),
      this.authController.loginSocial,
    );

    this.router.post(
      "/login/google",
      this.validationMiddleware.validateBody(LoginGoogleDTO),
      this.authController.loginGoogle,
    );

    this.router.post(
      "/verify-email",
      this.validationMiddleware.validateBody(VerifyEmailDTO),
      this.authController.verifyEmail,
    );

    this.router.post(
      "/resend-verification",
      this.validationMiddleware.validateBody(ResendVerificationDTO),
      this.authController.resendVerification,
    );

    this.router.post(
      "/reset-password",
      this.validationMiddleware.validateBody(RequestPasswordResetDTO),
      this.authController.requestPasswordReset,
    );

    this.router.post(
      "/confirm-reset-password",
      this.validationMiddleware.validateBody(ConfirmPasswordResetDTO),
      this.authController.confirmPasswordReset,
    );

    this.router.get(
      "/me",
      this.authMiddleware.requireAuth,
      this.authController.getMe,
    );

    this.router.patch(
      "/profile",
      this.authMiddleware.requireAuth,
      this.validationMiddleware.validateBody(UpdateProfileDTO),
      this.authController.updateProfile,
    );

    this.router.patch(
      "/password",
      this.authMiddleware.requireAuth,
      this.validationMiddleware.validateBody(UpdatePasswordDTO),
      this.authController.updatePassword,
    );

    this.router.patch(
      "/email",
      this.authMiddleware.requireAuth,
      this.validationMiddleware.validateBody(UpdateEmailDTO),
      this.authController.updateEmail,
    );
  };

  getRouter = () => {
    return this.router;
  };
}
