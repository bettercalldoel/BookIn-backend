import nodemailer from "nodemailer";
import {
  APP_BASE_URL,
  SMTP_FROM,
  SMTP_HOST,
  SMTP_PASS,
  SMTP_PORT,
  SMTP_SECURE,
  SMTP_USER,
} from "../config/env.js";

type VerificationEmailPayload = {
  to: string;
  name: string;
  token: string;
  expiresAt: Date;
};

type PasswordResetEmailPayload = {
  to: string;
  name: string;
  token: string;
  expiresAt: Date;
};

export const sendVerificationEmail = async (
  payload: VerificationEmailPayload,
) => {
  const verifyUrl = `${APP_BASE_URL}/verify-email?token=${payload.token}`;
  if (!SMTP_HOST) {
    console.log(
      `[Email] To: ${payload.to} | Hi ${payload.name}, verify at: ${verifyUrl} (expires ${payload.expiresAt.toISOString()})`,
    );
    console.warn(
      "[Email] SMTP_HOST belum di-set. Email verifikasi belum dikirim.",
    );
    return;
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE || SMTP_PORT === 465,
    auth:
      SMTP_USER && SMTP_PASS
        ? {
            user: SMTP_USER,
            pass: SMTP_PASS,
          }
        : undefined,
  });

  const fromAddress = SMTP_FROM || SMTP_USER || "no-reply@bookin.local";
  const subject = "Verifikasi Email BookIn";
  const expiresText = payload.expiresAt.toISOString();

  await transporter.sendMail({
    from: fromAddress,
    to: payload.to,
    subject,
    text: `Hi ${payload.name},\n\nSilakan verifikasi email Anda dengan membuka tautan berikut:\n${verifyUrl}\n\nLink berlaku hingga: ${expiresText}\n\nJika Anda tidak mendaftar, abaikan email ini.\n`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2>Verifikasi Email BookIn</h2>
        <p>Hi ${payload.name},</p>
        <p>Silakan verifikasi email Anda dengan klik tombol di bawah ini:</p>
        <p>
          <a href="${verifyUrl}" style="display: inline-block; padding: 10px 18px; background: #0f172a; color: #ffffff; text-decoration: none; border-radius: 20px;">
            Verifikasi Email
          </a>
        </p>
        <p>Atau copy link berikut:</p>
        <p><a href="${verifyUrl}">${verifyUrl}</a></p>
        <p><strong>Link berlaku hingga:</strong> ${expiresText}</p>
        <p>Jika Anda tidak mendaftar, abaikan email ini.</p>
      </div>
    `,
  });
};

export const sendPasswordResetEmail = async (
  payload: PasswordResetEmailPayload,
) => {
  const resetUrl = `${APP_BASE_URL}/reset-password/confirm?token=${payload.token}`;
  if (!SMTP_HOST) {
    console.log(
      `[Email] To: ${payload.to} | Hi ${payload.name}, reset at: ${resetUrl} (expires ${payload.expiresAt.toISOString()})`,
    );
    console.warn(
      "[Email] SMTP_HOST belum di-set. Email reset password belum dikirim.",
    );
    return;
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE || SMTP_PORT === 465,
    auth:
      SMTP_USER && SMTP_PASS
        ? {
            user: SMTP_USER,
            pass: SMTP_PASS,
          }
        : undefined,
  });

  const fromAddress = SMTP_FROM || SMTP_USER || "no-reply@bookin.local";
  const subject = "Reset Password BookIn";
  const expiresText = payload.expiresAt.toISOString();

  await transporter.sendMail({
    from: fromAddress,
    to: payload.to,
    subject,
    text: `Hi ${payload.name},\n\nSilakan reset password Anda dengan membuka tautan berikut:\n${resetUrl}\n\nLink berlaku hingga: ${expiresText}\n\nJika Anda tidak meminta reset password, abaikan email ini.\n`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2>Reset Password BookIn</h2>
        <p>Hi ${payload.name},</p>
        <p>Silakan reset password Anda dengan klik tombol di bawah ini:</p>
        <p>
          <a href="${resetUrl}" style="display: inline-block; padding: 10px 18px; background: #0f172a; color: #ffffff; text-decoration: none; border-radius: 20px;">
            Reset Password
          </a>
        </p>
        <p>Atau copy link berikut:</p>
        <p><a href="${resetUrl}">${resetUrl}</a></p>
        <p><strong>Link berlaku hingga:</strong> ${expiresText}</p>
        <p>Jika Anda tidak meminta reset password, abaikan email ini.</p>
      </div>
    `,
  });
};
