import type { AuthPayload } from "../modules/auth/auth.types.js";

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

export {};
