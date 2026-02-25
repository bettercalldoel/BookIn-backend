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

type RequestWithUploads = Request & {
  file?: UploadedFile;
  files?: UploadedFile[] | Record<string, UploadedFile[]>;
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

const collectUploadedFiles = (req: RequestWithUploads) => {
  if (req.file) return [req.file];
  if (Array.isArray(req.files)) return req.files;
  if (req.files && typeof req.files === "object") {
    return Object.values(req.files).flat();
  }
  return [];
};

const validateUploadedFiles = (
  files: UploadedFile[],
  options: FileValidationOptions,
) => {
  files.forEach((file) => validateSingleFile(file, options));
};

export function createFileValidationMiddleware(options: FileValidationOptions) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const files = collectUploadedFiles(req as RequestWithUploads);
    validateUploadedFiles(files, options);
    next();
  };
}
