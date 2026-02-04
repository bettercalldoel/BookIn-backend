import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { NextFunction, Request, Response } from "express";
import { ApiError } from "../utils/api-error.js";

export class ValidationMiddleware {
  validateBody<T>(dtoClass: new () => T) {
    return async (req: Request, _res: Response, next: NextFunction) => {
      const dtoInstance = plainToInstance(dtoClass, req.body);

      if (!req.body) throw new ApiError("Request body is required", 400);

      const errors = await validate(dtoInstance as any);

      if (errors.length > 0) {
        const message = errors
          .map((error) => Object.values(error.constraints || {}))
          .flat()
          .join(", ");

        throw new ApiError(message, 400);
      }

      req.body = dtoInstance;

      next();
    };
  }

  validateQuery<T>(dtoClass: new () => T) {
    return async (req: Request, _res: Response, next: NextFunction) => {
      const dtoInstance = plainToInstance(dtoClass, req.query);
      const errors = await validate(dtoInstance as any);

      if (errors.length > 0) {
        const message = errors
          .map((error) => Object.values(error.constraints || {}))
          .flat()
          .join(", ");

        throw new ApiError(message, 400);
      }

      Object.assign(req.query, dtoInstance as any);

      next();
    };
  }

  validateParams<T>(dtoClass: new () => T) {
    return async (req: Request, _res: Response, next: NextFunction) => {
      const dtoInstance = plainToInstance(dtoClass, req.params);
      const errors = await validate(dtoInstance as any);

      if (errors.length > 0) {
        const message = errors
          .map((error) => Object.values(error.constraints || {}))
          .flat()
          .join(", ");

        throw new ApiError(message, 400);
      }

      req.params = dtoInstance as any;

      next();
    };
  }
}

const sharedValidation = new ValidationMiddleware();

export const validateBody = <T>(dtoClass: new () => T) =>
  sharedValidation.validateBody(dtoClass);
export const validateQuery = <T>(dtoClass: new () => T) =>
  sharedValidation.validateQuery(dtoClass);
export const validateParams = <T>(dtoClass: new () => T) =>
  sharedValidation.validateParams(dtoClass);
export const validateBody = (DTO: any) => {
  return async (req: any, res: any, next: any) => {
    const dtoInstance = plainToInstance(DTO, req.body);

    const errors = await validate(dtoInstance, {
      whitelist: true, // remove unknown properties
      forbidNonWhitelisted: true, // error if unknown properties exist
    });

    if (errors.length > 0) {
      return res.status(422).json({
        message: "Validation failed",
        errors: errors.map((err) => ({
          field: err.property,
          constraints: err.constraints,
        })),
      });
    }

    req.body = dtoInstance;
    next();
  };
};

/**
 * Validate query params using DTO
 */
export const validateQuery = (DTO: any) => {
  return async (req: any, res: any, next: any) => {
    const dtoInstance = plainToInstance(DTO, req.query);

    const errors = await validate(dtoInstance, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    if (errors.length > 0) {
      return res.status(422).json({
        message: "Validation failed",
        errors: errors.map((err) => ({
          field: err.property,
          constraints: err.constraints,
        })),
      });
    }

    req.query = dtoInstance;
    next();
  };
};
