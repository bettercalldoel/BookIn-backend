import "dotenv/config";

export const PORT = process.env.PORT;
export const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret";
export const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? "1h";
export const APP_BASE_URL = process.env.APP_BASE_URL ?? "http://localhost:3000";
export const EMAIL_VERIFICATION_TTL_MINUTES = Number(
  process.env.EMAIL_VERIFICATION_TTL_MINUTES ?? "60",
);
export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "";
