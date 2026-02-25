import { NextFunction, Request, Response } from "express";
import { AccountType, PrismaClient } from "@prisma/client";
import { verifyAccessToken } from "../lib/jwt.js";
import { ApiError } from "../utils/api-error.js";

const extractBearerToken = (header?: string) => {
  if (!header?.startsWith("Bearer ")) throw new ApiError("Unauthorized.", 401);
  const token = header.slice("Bearer ".length).trim();
  if (!token) throw new ApiError("Unauthorized.", 401);
  return token;
};

const decodeAccessToken = (token: string) => {
  try {
    return verifyAccessToken(token);
  } catch {
    throw new ApiError("Invalid token.", 401);
  }
};

export class AuthMiddleware {
  constructor(private prisma: PrismaClient) {}

  requireAuth = (req: Request, _res: Response, next: NextFunction) => {
    const token = extractBearerToken(req.headers.authorization);
    req.user = decodeAccessToken(token);
    next();
  };

  requireVerifiedAccount = async (
    req: Request,
    _res: Response,
    next: NextFunction,
  ) => {
    if (!req.user) {
      throw new ApiError("Unauthorized.", 401);
    }

    const account = await this.prisma.account.findUnique({
      where: { id: req.user.sub },
    });

    if (!account?.isVerified) {
      throw new ApiError("Email belum terverifikasi.", 403);
    }

    next();
  };

  requireAccountType = (...allowed: AccountType[]) => {
    return (req: Request, _res: Response, next: NextFunction) => {
      if (!req.user) {
        throw new ApiError("Unauthorized.", 401);
      }

      if (!allowed.includes(req.user.type)) {
        throw new ApiError("Forbidden.", 403);
      }

      next();
    };
  };
}
