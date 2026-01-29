import { NextFunction, Request, Response } from "express";
import { ApiError } from "../utils/api-error.js";

export type FileValidationOptions = {
  allowedExtensions: string[];
  maxSizeBytes: number;
};

type UploadedFile = {
  originalname?: string;
  size?: number;
};

function validateSingleFile(
  file: UploadedFile,
  options: FileValidationOptions,
) {
  const extension = file.originalname?.split(".").pop()?.toLowerCase();
  if (!extension || !options.allowedExtensions.includes(extension)) {
    throw new ApiError(
      `Invalid file extension. Allowed: ${options.allowedExtensions.join(", ")}.`,
      400,
    );
  }

  if (typeof file.size === "number" && file.size > options.maxSizeBytes) {
    throw new ApiError("File size exceeds the allowed limit.", 400);
  }
}

export function createFileValidationMiddleware(options: FileValidationOptions) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const file = (req as Request & { file?: UploadedFile }).file;
    const files = (
      req as Request & {
        files?: UploadedFile[] | Record<string, UploadedFile[]>;
      }
    ).files;

    if (file) {
      validateSingleFile(file, options);
      return next();
    }

    if (Array.isArray(files)) {
      files.forEach((item) => validateSingleFile(item, options));
      return next();
    }

    if (files && typeof files === "object") {
      Object.values(files)
        .flat()
        .forEach((item) => validateSingleFile(item, options));
      return next();
    }

    return next();
  };
}
