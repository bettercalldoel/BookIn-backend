import { NextFunction, Request, Response } from "express";
import { ApiError } from "../utils/api-error.js";

export function requireApproval(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  const headerApproval = req.header("x-user-approval");
  const approved =
    headerApproval === "true" ||
    headerApproval === "1" ||
    (typeof req.body === "object" && req.body?.approved === true);

  if (!approved) {
    throw new ApiError(
      "User approval is required before processing this action.",
      400,
    );
  }

  next();
}
