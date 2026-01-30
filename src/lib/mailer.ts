import { APP_BASE_URL } from "../config/env.js";

type VerificationEmailPayload = {
  to: string;
  name: string;
  token: string;
  expiresAt: Date;
};

export const sendVerificationEmail = async (
  payload: VerificationEmailPayload,
) => {
  const verifyUrl = `${APP_BASE_URL}/verify-email?token=${payload.token}`;
  console.log(
    `[Email] To: ${payload.to} | Hi ${payload.name}, verify at: ${verifyUrl} (expires ${payload.expiresAt.toISOString()})`,
  );
};
