import { Request, Response } from "express";
import { ApiError } from "../../utils/api-error.js";
import { PropertyService } from "./property.service.js";
import { CreatePropertyDTO } from "./dto/create-property.dto.js";

export class PropertyController {
  constructor(private propertyService: PropertyService) {}

  createProperty = async (req: Request, res: Response) => {
    const tenantAccountId = req.user?.sub ?? "";
    if (!tenantAccountId) {
      throw new ApiError("Unauthorized.", 401);
    }

    const result = await this.propertyService.createProperty(
      tenantAccountId,
      req.body as CreatePropertyDTO,
    );

    res.status(201).json(result);
  };
}
