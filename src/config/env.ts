import "dotenv/config";

const parsePort = (value: string | undefined) => {
  const parsed = Number(value ?? "8000");
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`PORT must be a positive integer. Received: ${value}`);
  }
  return parsed;
};

const parseCorsOrigins = (value: string | undefined) => {
  const parsed = (value ?? "*")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : ["*"];
};

export const PORT = parsePort(process.env.PORT);
export const CORS_ALLOWED_ORIGINS = parseCorsOrigins(
  process.env.CORS_ALLOWED_ORIGINS,
);
export const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret";
export const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? "1h";
export const APP_BASE_URL = process.env.APP_BASE_URL ?? "http://localhost:3000";
export const EMAIL_VERIFICATION_TTL_MINUTES = Number(
  process.env.EMAIL_VERIFICATION_TTL_MINUTES ?? "60",
);
export const PASSWORD_RESET_TTL_MINUTES = Number(
  process.env.PASSWORD_RESET_TTL_MINUTES ?? "60",
);
export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "";
export const SMTP_HOST = process.env.SMTP_HOST ?? "";
export const SMTP_PORT = Number(process.env.SMTP_PORT ?? "587");
export const SMTP_USER = process.env.SMTP_USER ?? "";
export const SMTP_PASS = process.env.SMTP_PASS ?? "";
export const SMTP_FROM = process.env.SMTP_FROM ?? "";
export const SMTP_SECURE = process.env.SMTP_SECURE === "true";
export const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME ?? "";
export const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY ?? "";
export const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET ?? "";
export const CLOUDINARY_UPLOAD_FOLDER =
  process.env.CLOUDINARY_UPLOAD_FOLDER ?? "";
export const XENDIT_SECRET_KEY = process.env.XENDIT_SECRET_KEY ?? "";
export const XENDIT_CALLBACK_TOKEN = process.env.XENDIT_CALLBACK_TOKEN ?? "";
export const XENDIT_API_BASE_URL =
  process.env.XENDIT_API_BASE_URL ?? "https://api.xendit.co";
export const XENDIT_INVOICE_EXPIRY_MINUTES = Number(
  process.env.XENDIT_INVOICE_EXPIRY_MINUTES ?? "30",
);
export const BOOKING_PAYMENT_DUE_MINUTES = Number(
  process.env.BOOKING_PAYMENT_DUE_MINUTES ?? "120",
);
export const BOOKING_PROOF_UPLOAD_DUE_MINUTES = Number(
  process.env.BOOKING_PROOF_UPLOAD_DUE_MINUTES ?? "60",
);
