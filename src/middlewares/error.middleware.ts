import multer from "multer";
import { NextFunction, Request, Response } from "express";
import { ApiError } from "../utils/api-error.js";

export const errorMiddleware = (
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
) => {
  if (err instanceof ApiError) {
    req.log.error({ err }, err.message);
    res.status(err.status || 500).send({ message: err.message });
    return;
  }

  if (err instanceof multer.MulterError) {
    const status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    const message =
      err.code === "LIMIT_FILE_SIZE"
        ? "Ukuran file melebihi batas maksimum 1MB."
        : "File upload tidak valid.";

    req.log.error({ err }, message);
    res.status(status).send({ message });
    return;
  }

  if (err instanceof Error) {
    const message = err.message || "Something went wrong!";
    const status = /jpe?g|png/i.test(message) ? 400 : 500;
    req.log.error({ err }, message);
    res.status(status).send({ message });
    return;
  }

  req.log.error({ err }, "Unhandled error.");
  const message = "Something went wrong!";
  const status = 500;
  res.status(status).send({ message });
};
