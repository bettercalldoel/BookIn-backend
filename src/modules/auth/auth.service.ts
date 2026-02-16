import crypto from "crypto";
import { OAuth2Client } from "google-auth-library";
import { AccountType, AuthProvider, PrismaClient } from "@prisma/client";
import {
  EMAIL_VERIFICATION_TTL_MINUTES,
  GOOGLE_CLIENT_ID,
  PASSWORD_RESET_TTL_MINUTES,
} from "../../config/env.js";
import { signAccessToken } from "../../lib/jwt.js";
import {
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "../../lib/mailer.js";
import { hashPassword, verifyPassword } from "../../lib/password.js";
import { ApiError } from "../../utils/api-error.js";
import { LoginDTO } from "./dto/login.dto.js";
import { LoginSocialDTO } from "./dto/login-social.dto.js";
import { LoginGoogleDTO } from "./dto/login-google.dto.js";
import { RegisterSocialDTO } from "./dto/register-social.dto.js";
import { RegisterTenantDTO } from "./dto/register-tenant.dto.js";
import { RegisterUserDTO } from "./dto/register-user.dto.js";
import { RequestPasswordResetDTO } from "./dto/request-password-reset.dto.js";
import { ResendVerificationDTO } from "./dto/resend-verification.dto.js";
import { ConfirmPasswordResetDTO } from "./dto/confirm-password-reset.dto.js";
import { VerifyEmailDTO } from "./dto/verify-email.dto.js";

const MAX_EMAIL_TTL_MINUTES = 60;
const MAX_RESET_TTL_MINUTES = 60;
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

type AccountWithProfiles = {
  id: string;
  email: string;
  type: AccountType;
  isVerified?: boolean;
  verifiedAt?: Date | null;
  userProfile?: { fullName: string } | null;
  tenantProfile?: { displayName: string } | null;
};

export class AuthService {
  constructor(private prisma: PrismaClient) {}

  registerUser = async (body: RegisterUserDTO) => {
    const email = this.normalizeEmail(body.email);
    await this.ensureEmailAvailable(email);
    const fullName = body.name?.trim() ?? "";

    const account = await this.prisma.account.create({
      data: {
        email,
        type: AccountType.USER,
        avatarUrl: body.avatarUrl,
        userProfile: {
          create: { fullName },
        },
      },
    });

    const { token, expiresAt } = await this.createEmailVerificationToken(
      account.id,
    );
    await sendVerificationEmail({
      to: account.email,
      name: fullName,
      token,
      expiresAt,
    });

    return {
      message:
        "Registrasi berhasil. Silakan cek email untuk verifikasi dan membuat password.",
      email: account.email,
      expiresAt,
    };
  };

  registerTenant = async (body: RegisterTenantDTO) => {
    const email = this.normalizeEmail(body.email);
    await this.ensureEmailAvailable(email);
    const displayName = body.companyName?.trim() || body.name?.trim() || "";

    const account = await this.prisma.account.create({
      data: {
        email,
        type: AccountType.TENANT,
        avatarUrl: body.avatarUrl,
        tenantProfile: {
          create: {
            displayName,
          },
        },
      },
    });

    const { token, expiresAt } = await this.createEmailVerificationToken(
      account.id,
    );
    await sendVerificationEmail({
      to: account.email,
      name: displayName,
      token,
      expiresAt,
    });

    return {
      message:
        "Registrasi berhasil. Silakan cek email untuk verifikasi dan membuat password.",
      email: account.email,
      expiresAt,
    };
  };

  registerOrLoginSocial = async (body: RegisterSocialDTO) => {
    if (body.provider === AuthProvider.EMAIL) {
      throw new ApiError("Provider social tidak valid.", 400);
    }

    const providerUserId = body.providerUserId.trim();
    const existingOauth = await this.prisma.oAuthAccount.findUnique({
      where: {
        provider_providerUserId: {
          provider: body.provider,
          providerUserId,
        },
      },
    });

    if (existingOauth) {
      const account = await this.prisma.account.findUnique({
        where: { id: existingOauth.accountId },
        include: { userProfile: true, tenantProfile: true },
      });
      if (!account) throw new ApiError("Akun tidak ditemukan.", 404);

      return this.buildAuthResponse(account, false);
    }

    const email = this.normalizeEmail(body.email);
    await this.ensureEmailAvailable(email);

    const displayName =
      body.accountType === AccountType.TENANT
        ? body.companyName?.trim() || body.name.trim()
        : body.name.trim();

    const account = await this.prisma.account.create({
      data: {
        email,
        type: body.accountType,
        isVerified: true,
        verifiedAt: new Date(),
        avatarUrl: body.avatarUrl,
        userProfile:
          body.accountType === AccountType.USER
            ? {
                create: { fullName: displayName },
              }
            : undefined,
        tenantProfile:
          body.accountType === AccountType.TENANT
            ? {
                create: { displayName },
              }
            : undefined,
      },
      include: { userProfile: true, tenantProfile: true },
    });

    await this.prisma.oAuthAccount.create({
      data: {
        accountId: account.id,
        provider: body.provider,
        providerUserId,
      },
    });

    return this.buildAuthResponse(account, true);
  };

  login = async (body: LoginDTO) => {
    const email = this.normalizeEmail(body.email);
    const account = await this.prisma.account.findUnique({
      where: { email },
      include: { userProfile: true, tenantProfile: true },
    });

    if (!account || !account.passwordHash) {
      throw new ApiError("Email atau password salah.", 401);
    }

    if (!account.isVerified) {
      throw new ApiError("Email belum terverifikasi.", 403);
    }

    const passwordMatches = await verifyPassword(
      body.password,
      account.passwordHash,
    );
    if (!passwordMatches) {
      throw new ApiError("Email atau password salah.", 401);
    }

    return this.buildAuthResponse(account, false);
  };

  loginSocial = async (body: LoginSocialDTO) => {
    if (body.provider === AuthProvider.EMAIL) {
      throw new ApiError("Provider social tidak valid.", 400);
    }

    const providerUserId = body.providerUserId.trim();
    const oauth = await this.prisma.oAuthAccount.findUnique({
      where: {
        provider_providerUserId: {
          provider: body.provider,
          providerUserId,
        },
      },
    });

    if (!oauth) {
      throw new ApiError("Akun social belum terdaftar.", 404);
    }

    const account = await this.prisma.account.findUnique({
      where: { id: oauth.accountId },
      include: { userProfile: true, tenantProfile: true },
    });
    if (!account) throw new ApiError("Akun tidak ditemukan.", 404);

    return this.buildAuthResponse(account, false);
  };

  loginGoogle = async (body: LoginGoogleDTO) => {
    if (!GOOGLE_CLIENT_ID) {
      throw new ApiError("Google OAuth belum dikonfigurasi.", 500);
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: body.idToken,
      audience: GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    if (!payload?.email || !payload.sub) {
      throw new ApiError("Token Google tidak valid.", 400);
    }

    const email = this.normalizeEmail(payload.email);
    const providerUserId = payload.sub;

    const existingOauth = await this.prisma.oAuthAccount.findUnique({
      where: {
        provider_providerUserId: {
          provider: AuthProvider.GOOGLE,
          providerUserId,
        },
      },
    });

    if (existingOauth) {
      const account = await this.prisma.account.findUnique({
        where: { id: existingOauth.accountId },
        include: { userProfile: true, tenantProfile: true },
      });
      if (!account) throw new ApiError("Akun tidak ditemukan.", 404);
      return this.buildAuthResponse(account, false);
    }

    const existingByEmail = await this.prisma.account.findUnique({
      where: { email },
    });
    if (existingByEmail) {
      throw new ApiError("Email sudah terdaftar.", 409);
    }

    const accountType = body.accountType ?? AccountType.USER;
    const displayName = payload.name?.trim() || email.split("@")[0];

    const account = await this.prisma.account.create({
      data: {
        email,
        type: accountType,
        isVerified: true,
        verifiedAt: new Date(),
        avatarUrl: payload.picture,
        userProfile:
          accountType === AccountType.USER
            ? { create: { fullName: displayName } }
            : undefined,
        tenantProfile:
          accountType === AccountType.TENANT
            ? {
                create: { displayName },
              }
            : undefined,
      },
      include: { userProfile: true, tenantProfile: true },
    });

    await this.prisma.oAuthAccount.create({
      data: {
        accountId: account.id,
        provider: AuthProvider.GOOGLE,
        providerUserId,
      },
    });

    return this.buildAuthResponse(account, true);
  };

  verifyEmail = async (body: VerifyEmailDTO) => {
    const tokenHash = this.hashToken(body.token.trim());

    const token = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash },
      include: { account: true },
    });

    if (!token) {
      throw new ApiError("Token verifikasi tidak valid.", 400);
    }

    if (token.usedAt) {
      throw new ApiError("Token verifikasi sudah digunakan.", 400);
    }

    if (token.expiresAt.getTime() < Date.now()) {
      throw new ApiError(
        "Token verifikasi sudah kedaluwarsa. Silakan kirim ulang email verifikasi.",
        400,
      );
    }

    if (token.account.isVerified || token.account.verifiedAt) {
      throw new ApiError("Email sudah terverifikasi.", 400);
    }

    const now = new Date();
    const hasPassword = Boolean(token.account.passwordHash);
    const nextName = body.name?.trim();
    const nextPassword = body.password?.trim();

    if (!nextName || nextName.length < 2) {
      throw new ApiError("Nama wajib diisi.", 400);
    }

    if (nextPassword && nextPassword.length < 8) {
      throw new ApiError("Password minimal 8 karakter.", 400);
    }

    if (hasPassword) {
      const currentPassword = body.currentPassword?.trim();
      if (currentPassword) {
        const matches = await verifyPassword(
          currentPassword,
          token.account.passwordHash ?? "",
        );
        if (!matches) {
          throw new ApiError("Password lama salah.", 400);
        }
      } else if (!nextPassword) {
        throw new ApiError("Password wajib diisi.", 400);
      }
    }

    const passwordHash = nextPassword
      ? await hashPassword(nextPassword)
      : undefined;

    const profileUpdates = [];
    if (nextName) {
      if (token.account.type === AccountType.USER) {
        profileUpdates.push(
          this.prisma.userProfile.upsert({
            where: { accountId: token.accountId },
            update: { fullName: nextName },
            create: { accountId: token.accountId, fullName: nextName },
          }),
        );
      } else if (token.account.type === AccountType.TENANT) {
        profileUpdates.push(
          this.prisma.tenantProfile.upsert({
            where: { accountId: token.accountId },
            update: { displayName: nextName },
            create: { accountId: token.accountId, displayName: nextName },
          }),
        );
      }
    }

    await this.prisma.$transaction([
      this.prisma.account.update({
        where: { id: token.accountId },
        data: {
          isVerified: true,
          verifiedAt: now,
          passwordHash: passwordHash ?? token.account.passwordHash,
        },
      }),
      this.prisma.emailVerificationToken.update({
        where: { id: token.id },
        data: { usedAt: now },
      }),
      ...profileUpdates,
    ]);

    if (!hasPassword && !passwordHash) {
      const { token: resetToken, expiresAt } =
        await this.createPasswordResetToken(token.accountId);
      await sendPasswordResetEmail({
        to: token.account.email,
        name: this.resolveAccountName(token.account),
        token: resetToken,
        expiresAt,
      });
      return {
        message:
          "Email berhasil diverifikasi. Silakan cek email untuk reset password.",
      };
    }

    return {
      message: "Email berhasil diverifikasi. Silakan login kembali.",
    };
  };

  resendVerification = async (body: ResendVerificationDTO) => {
    const email = this.normalizeEmail(body.email);
    const account = await this.prisma.account.findUnique({
      where: { email },
      include: { userProfile: true, tenantProfile: true },
    });

    if (!account) {
      return {
        message:
          "Jika email terdaftar, kami akan mengirimkan email verifikasi.",
      };
    }

    if (account.isVerified) {
      throw new ApiError("Email sudah terverifikasi.", 400);
    }

    const { token, expiresAt } = await this.createEmailVerificationToken(
      account.id,
    );
    await sendVerificationEmail({
      to: account.email,
      name: this.resolveAccountName(account),
      token,
      expiresAt,
    });

    return {
      message: "Email verifikasi berhasil dikirim ulang.",
      email: account.email,
      expiresAt,
    };
  };

  requestPasswordReset = async (body: RequestPasswordResetDTO) => {
    const email = this.normalizeEmail(body.email);
    const account = await this.prisma.account.findUnique({
      where: { email },
      include: { oauthAccounts: true, userProfile: true, tenantProfile: true },
    });

    if (!account) {
      return {
        message:
          "Jika email terdaftar, kami akan mengirimkan instruksi reset password.",
      };
    }

    if (account.oauthAccounts.length > 0 || !account.passwordHash) {
      throw new ApiError(
        "Reset password hanya tersedia untuk akun yang dibuat dengan email dan password.",
        400,
      );
    }

    const { token, expiresAt } = await this.createPasswordResetToken(
      account.id,
    );

    await sendPasswordResetEmail({
      to: account.email,
      name: this.resolveAccountName(account),
      token,
      expiresAt,
    });

    return {
      message:
        "Jika email terdaftar, kami akan mengirimkan instruksi reset password.",
      email: account.email,
      expiresAt,
    };
  };

  confirmPasswordReset = async (body: ConfirmPasswordResetDTO) => {
    const tokenHash = this.hashToken(body.token.trim());

    const token = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: {
        account: {
          include: {
            oauthAccounts: true,
            userProfile: true,
            tenantProfile: true,
          },
        },
      },
    });

    if (!token) {
      throw new ApiError("Token reset password tidak valid.", 400);
    }

    if (token.usedAt) {
      throw new ApiError("Token reset password sudah digunakan.", 400);
    }

    if (token.expiresAt.getTime() < Date.now()) {
      throw new ApiError(
        "Token reset password sudah kedaluwarsa. Silakan lakukan permintaan ulang.",
        400,
      );
    }

    if (token.account.oauthAccounts.length > 0 || !token.account.passwordHash) {
      throw new ApiError(
        "Reset password hanya tersedia untuk akun yang dibuat dengan email dan password.",
        400,
      );
    }

    const isSamePassword = await verifyPassword(
      body.newPassword,
      token.account.passwordHash,
    );
    if (isSamePassword) {
      throw new ApiError(
        "Password baru tidak boleh sama dengan password lama.",
        400,
      );
    }

    const passwordHash = await hashPassword(body.newPassword);
    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.account.update({
        where: { id: token.accountId },
        data: { passwordHash },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: token.id },
        data: { usedAt: now },
      }),
    ]);

    return {
      message: "Password berhasil direset. Silakan login kembali.",
    };
  };

  getMe = async (accountId: string) => {
    if (!accountId) throw new ApiError("Unauthorized.", 401);

    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      include: {
        userProfile: true,
        tenantProfile: true,
      },
    });

    if (!account) throw new ApiError("Akun tidak ditemukan.", 404);

    return {
      id: account.id,
      email: account.email,
      name: this.resolveAccountName(account),
      type: account.type,
      avatarUrl: account.avatarUrl,
      emailVerifiedAt: account.verifiedAt,
      isVerified: account.isVerified,
      hasPassword: Boolean(account.passwordHash),
      userProfile: account.userProfile,
      tenantProfile: account.tenantProfile,
    };
  };

  updateProfile = async (
    accountId: string,
    body: { name?: string; avatarUrl?: string },
  ) => {
    if (!accountId) throw new ApiError("Unauthorized.", 401);

    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      include: { userProfile: true, tenantProfile: true },
    });

    if (!account) throw new ApiError("Akun tidak ditemukan.", 404);

    const updates: Record<string, unknown> = {};
    if (body.avatarUrl !== undefined) {
      updates.avatarUrl = body.avatarUrl?.trim() || null;
    }

    const name = body.name?.trim();
    if (name) {
      if (account.type === AccountType.USER) {
        if (account.userProfile) {
          await this.prisma.userProfile.update({
            where: { accountId },
            data: { fullName: name },
          });
        } else {
          await this.prisma.userProfile.create({
            data: {
              accountId,
              fullName: name,
            },
          });
        }
      } else if (account.type === AccountType.TENANT) {
        if (account.tenantProfile) {
          await this.prisma.tenantProfile.update({
            where: { accountId },
            data: { displayName: name },
          });
        } else {
          await this.prisma.tenantProfile.create({
            data: {
              accountId,
              displayName: name,
            },
          });
        }
      }
    }

    if (Object.keys(updates).length > 0) {
      await this.prisma.account.update({
        where: { id: accountId },
        data: updates,
      });
    }

    return {
      message: "Profil berhasil diperbarui.",
    };
  };

  updatePassword = async (
    accountId: string,
    body: { currentPassword?: string; newPassword: string },
  ) => {
    if (!accountId) throw new ApiError("Unauthorized.", 401);

    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
    });

    if (!account) throw new ApiError("Akun tidak ditemukan.", 404);

    if (account.passwordHash) {
      if (!body.currentPassword) {
        throw new ApiError("Password saat ini wajib diisi.", 400);
      }
      const matches = await verifyPassword(
        body.currentPassword,
        account.passwordHash,
      );
      if (!matches) {
        throw new ApiError("Password saat ini salah.", 400);
      }
    }

    const passwordHash = await hashPassword(body.newPassword);
    await this.prisma.account.update({
      where: { id: accountId },
      data: { passwordHash },
    });

    return {
      message: "Password berhasil diperbarui.",
    };
  };

  updateEmail = async (accountId: string, body: { email: string }) => {
    if (!accountId) throw new ApiError("Unauthorized.", 401);

    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      include: { userProfile: true, tenantProfile: true },
    });

    if (!account) throw new ApiError("Akun tidak ditemukan.", 404);

    const email = this.normalizeEmail(body.email);
    if (email === account.email) {
      throw new ApiError("Email baru sama dengan email sekarang.", 400);
    }

    const existing = await this.prisma.account.findUnique({
      where: { email },
    });
    if (existing) {
      throw new ApiError("Email sudah terdaftar.", 409);
    }

    await this.prisma.account.update({
      where: { id: accountId },
      data: {
        email,
        isVerified: false,
        verifiedAt: null,
      },
    });

    const { token, expiresAt } =
      await this.createEmailVerificationToken(accountId);
    await sendVerificationEmail({
      to: email,
      name: this.resolveAccountName(account),
      token,
      expiresAt,
    });

    return {
      message:
        "Email berhasil diperbarui. Silakan cek email untuk verifikasi ulang.",
      email,
      expiresAt,
    };
  };

  private buildAuthResponse = (
    account: AccountWithProfiles,
    isNew: boolean,
  ) => {
    const name = this.resolveAccountName(account);
    const accessToken = signAccessToken({
      sub: account.id,
      type: account.type,
    });

    return {
      accessToken,
      account: {
        id: account.id,
        email: account.email,
        name,
        type: account.type,
      },
      isNew,
    };
  };

  private resolveAccountName(account: AccountWithProfiles) {
    const fallback = account.email.split("@")[0];
    if (account.type === AccountType.TENANT) {
      return account.tenantProfile?.displayName?.trim() || fallback;
    }
    return account.userProfile?.fullName?.trim() || fallback;
  }

  private normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }

  private async ensureEmailAvailable(email: string) {
    const existing = await this.prisma.account.findUnique({
      where: { email },
    });

    if (existing) {
      if (!existing.isVerified && !existing.verifiedAt) {
        throw new ApiError(
          "Email sudah terdaftar namun belum terverifikasi. Silakan verifikasi atau kirim ulang email.",
          409,
        );
      }
      throw new ApiError("Email sudah terdaftar.", 409);
    }
  }

  private async createEmailVerificationToken(accountId: string) {
    const token = crypto.randomBytes(32).toString("base64url");
    const tokenHash = this.hashToken(token);
    const ttlMinutes =
      Number.isFinite(EMAIL_VERIFICATION_TTL_MINUTES) &&
      EMAIL_VERIFICATION_TTL_MINUTES > 0
        ? Math.min(EMAIL_VERIFICATION_TTL_MINUTES, MAX_EMAIL_TTL_MINUTES)
        : MAX_EMAIL_TTL_MINUTES;
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

    await this.prisma.emailVerificationToken.create({
      data: {
        accountId,
        tokenHash,
        expiresAt,
      },
    });

    return { token, expiresAt };
  }

  private async createPasswordResetToken(accountId: string) {
    const token = crypto.randomBytes(32).toString("base64url");
    const tokenHash = this.hashToken(token);
    const ttlMinutes =
      Number.isFinite(PASSWORD_RESET_TTL_MINUTES) &&
      PASSWORD_RESET_TTL_MINUTES > 0
        ? Math.min(PASSWORD_RESET_TTL_MINUTES, MAX_RESET_TTL_MINUTES)
        : MAX_RESET_TTL_MINUTES;
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

    await this.prisma.passwordResetToken.create({
      data: {
        accountId,
        tokenHash,
        expiresAt,
      },
    });

    return { token, expiresAt };
  }

  private hashToken(token: string) {
    return crypto.createHash("sha256").update(token).digest("hex");
  }
}
