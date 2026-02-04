import { Request, Response } from "express";
import { AuthService } from "./auth.service.js";
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

export class AuthController {
  constructor(private authService: AuthService) {}

  private setAuthHeader = (res: Response, token?: string) => {
    if (token) {
      res.setHeader("Authorization", `Bearer ${token}`);
    }
  };

  private sendAuthResponse = (
    res: Response,
    result: { accessToken?: string; [key: string]: unknown },
    status = 200,
  ) => {
    this.setAuthHeader(res, result.accessToken);
    const { accessToken: _accessToken, ...body } = result;
    res.status(status).send(body);
  };

  registerUser = async (req: Request, res: Response) => {
    const result = await this.authService.registerUser(
      req.body as RegisterUserDTO,
    );
    res.status(201).send(result);
  };

  registerTenant = async (req: Request, res: Response) => {
    const result = await this.authService.registerTenant(
      req.body as RegisterTenantDTO,
    );
    res.status(201).send(result);
  };

  registerSocial = async (req: Request, res: Response) => {
    const result = await this.authService.registerOrLoginSocial(
      req.body as RegisterSocialDTO,
    );
    this.sendAuthResponse(res, result);
  };

  login = async (req: Request, res: Response) => {
    const result = await this.authService.login(req.body as LoginDTO);
    this.sendAuthResponse(res, result);
  };

  loginSocial = async (req: Request, res: Response) => {
    const result = await this.authService.loginSocial(
      req.body as LoginSocialDTO,
    );
    this.sendAuthResponse(res, result);
  };

  loginGoogle = async (req: Request, res: Response) => {
    const result = await this.authService.loginGoogle(
      req.body as LoginGoogleDTO,
    );
    this.sendAuthResponse(res, result);
  };

  verifyEmail = async (req: Request, res: Response) => {
    const result = await this.authService.verifyEmail(
      req.body as VerifyEmailDTO,
    );
    res.status(200).send(result);
  };

  resendVerification = async (req: Request, res: Response) => {
    const result = await this.authService.resendVerification(
      req.body as ResendVerificationDTO,
    );
    res.status(200).send(result);
  };

  requestPasswordReset = async (req: Request, res: Response) => {
    const result = await this.authService.requestPasswordReset(
      req.body as RequestPasswordResetDTO,
    );
    res.status(200).send(result);
  };

  confirmPasswordReset = async (req: Request, res: Response) => {
    const result = await this.authService.confirmPasswordReset(
      req.body as ConfirmPasswordResetDTO,
    );
    res.status(200).send(result);
  };

  getMe = async (req: Request, res: Response) => {
    const result = await this.authService.getMe(req.user?.sub ?? "");
    res.status(200).send(result);
  };

  updateProfile = async (req: Request, res: Response) => {
    const result = await this.authService.updateProfile(
      req.user?.sub ?? "",
      req.body as UpdateProfileDTO,
    );
    res.status(200).send(result);
  };

  updatePassword = async (req: Request, res: Response) => {
    const result = await this.authService.updatePassword(
      req.user?.sub ?? "",
      req.body as UpdatePasswordDTO,
    );
    res.status(200).send(result);
  };

  updateEmail = async (req: Request, res: Response) => {
    const result = await this.authService.updateEmail(
      req.user?.sub ?? "",
      req.body as UpdateEmailDTO,
    );
    res.status(200).send(result);
  };
}
