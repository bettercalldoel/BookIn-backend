import { Request, Response } from "express";
import { ApiError } from "../../utils/api-error.js";
import { PropertyService } from "./property.service.js";
import { CreatePropertyDTO } from "./dto/create-property.dto.js";
import { UpdatePropertyDTO } from "./dto/update-property.dto.js";
import { CreateRoomDTO } from "./dto/create-room.dto.js";
import { UpdateRoomDTO } from "./dto/update-room.dto.js";
import { SearchPropertyQueryDTO } from "./dto/search-property.dto.js";
import { ListPropertyQueryDTO } from "./dto/list-property-query.dto.js";
import { UpdatePropertyBreakfastDTO } from "./dto/update-breakfast.dto.js";
import { ListPublicCityQueryDTO } from "./dto/list-public-city-query.dto.js";
import { ListPublicCategoryQueryDTO } from "./dto/list-public-category-query.dto.js";

export class PropertyController {
  constructor(private propertyService: PropertyService) {}

  listPublicCategories = async (req: Request, res: Response) => {
    const query = req.query as unknown as ListPublicCategoryQueryDTO;
    const search = String(query.search ?? "").trim();
    const limitRaw = Number(query.limit ?? 100);
    const pageRaw = Number(query.page ?? 1);
    const limit =
      Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 500) : 100;
    const page =
      Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
    const sortBy = query.sortBy === "name" ? "name" : "name";
    const sortOrder = query.sortOrder === "desc" ? "desc" : "asc";

    const result = await this.propertyService.listPublicCategories(search, {
      page,
      limit,
      sortBy,
      sortOrder,
    });
    res.status(200).json(result);
  };

  listPublicCities = async (req: Request, res: Response) => {
    const query = req.query as unknown as ListPublicCityQueryDTO;
    const search = String(query.search ?? "").trim();
    const limitRaw = Number(query.limit ?? 100);
    const pageRaw = Number(query.page ?? 1);
    const limit =
      Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 500) : 100;
    const page =
      Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
    const sortOrder = query.sortOrder === "desc" ? "desc" : "asc";

    const result = await this.propertyService.listPublicCities(search, {
      page,
      limit,
      sortOrder,
    });
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

  updatePropertyBreakfast = async (req: Request, res: Response) => {
    const tenantAccountId = req.user?.sub ?? "";
    if (!tenantAccountId) {
      throw new ApiError("Unauthorized.", 401);
    }

    const result = await this.propertyService.updatePropertyBreakfast(
      tenantAccountId,
      String(req.params.id ?? ""),
      req.body as UpdatePropertyBreakfastDTO,
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
