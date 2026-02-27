import { NextFunction, Request, Response } from "express";
import { ApiError } from "../utils/api-error.js";

const APPROVAL_HEADER_KEY = "x-user-approval";

const isApproved = (value: string | string[] | undefined) => {
  if (Array.isArray(value)) {
    return value.some((item) => item.toLowerCase().trim() === "true");
  }
  return value?.toLowerCase().trim() === "true";
};

export const requireUserApproval = (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  if (isApproved(req.headers[APPROVAL_HEADER_KEY])) {
    next();
    return;
  }

  throw new ApiError(
    "Aksi ini membutuhkan persetujuan pengguna. Konfirmasi terlebih dahulu.",
    400,
  );
};

