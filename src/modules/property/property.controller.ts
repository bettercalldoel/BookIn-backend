import { Request, Response } from "express";
import { ApiError } from "../../utils/api-error.js";
import { PropertyService } from "./property.service.js";
import { CreatePropertyDTO } from "./dto/create-property.dto.js";
import { UpdatePropertyDTO } from "./dto/update-property.dto.js";
import { CreateRoomDTO } from "./dto/create-room.dto.js";
import { UpdateRoomDTO } from "./dto/update-room.dto.js";
import { SearchPropertyQueryDTO } from "./dto/search-property.dto.js";
import { ListPropertyQueryDTO } from "./dto/list-property-query.dto.js";

export class PropertyController {
  constructor(private propertyService: PropertyService) {}

  listPublicCategories = async (_req: Request, res: Response) => {
    const result = await this.propertyService.listPublicCategories();
    res.status(200).json(result);
  };

  listPublicCities = async (req: Request, res: Response) => {
    const search = String(req.query.search ?? "").trim();
    const limitRaw = Number(req.query.limit ?? 100);
    const limit =
      Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 500) : 100;

    const result = await this.propertyService.listPublicCities(search, limit);
    res.status(200).json(result);
  };

  listProperties = async (req: Request, res: Response) => {
    const tenantAccountId = req.user?.sub ?? "";
    if (!tenantAccountId) {
      throw new ApiError("Unauthorized.", 401);
    }

    const result = await this.propertyService.listProperties(
      tenantAccountId,
      req.query as unknown as ListPropertyQueryDTO,
    );
    res.status(200).json(result);
  };

  listPublicProperties = async (req: Request, res: Response) => {
    const result = await this.propertyService.listPublicProperties(
      req.query as unknown as SearchPropertyQueryDTO,
    );
    res.status(200).json(result);
  };

  getPublicProperty = async (req: Request, res: Response) => {
    const result = await this.propertyService.getPublicProperty(
      String(req.params.id ?? ""),
    );
    res.status(200).json(result);
  };

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

  updateProperty = async (req: Request, res: Response) => {
    const tenantAccountId = req.user?.sub ?? "";
    if (!tenantAccountId) {
      throw new ApiError("Unauthorized.", 401);
    }

    const result = await this.propertyService.updateProperty(
      tenantAccountId,
      String(req.params.id ?? ""),
      req.body as UpdatePropertyDTO,
    );

    res.status(200).json(result);
  };

  deleteProperty = async (req: Request, res: Response) => {
    const tenantAccountId = req.user?.sub ?? "";
    if (!tenantAccountId) {
      throw new ApiError("Unauthorized.", 401);
    }

    const result = await this.propertyService.deleteProperty(
      tenantAccountId,
      String(req.params.id ?? ""),
    );

    res.status(200).json(result);
  };

  createRoom = async (req: Request, res: Response) => {
    const tenantAccountId = req.user?.sub ?? "";
    if (!tenantAccountId) {
      throw new ApiError("Unauthorized.", 401);
    }

    const result = await this.propertyService.createRoom(
      tenantAccountId,
      String(req.params.id ?? ""),
      req.body as CreateRoomDTO,
    );

    res.status(201).json(result);
  };

  updateRoom = async (req: Request, res: Response) => {
    const tenantAccountId = req.user?.sub ?? "";
    if (!tenantAccountId) {
      throw new ApiError("Unauthorized.", 401);
    }

    const result = await this.propertyService.updateRoom(
      tenantAccountId,
      String(req.params.id ?? ""),
      req.body as UpdateRoomDTO,
    );

    res.status(200).json(result);
  };

  deleteRoom = async (req: Request, res: Response) => {
    const tenantAccountId = req.user?.sub ?? "";
    if (!tenantAccountId) {
      throw new ApiError("Unauthorized.", 401);
    }

    const result = await this.propertyService.deleteRoom(
      tenantAccountId,
      String(req.params.id ?? ""),
    );

    res.status(200).json(result);
  };
}
