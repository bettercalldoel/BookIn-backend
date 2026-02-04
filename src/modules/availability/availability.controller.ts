import { Request, Response } from "express";
import { ApiError } from "../../utils/api-error.js";
import { AvailabilityService } from "./availability.service.js";
import { UpdateRoomAvailabilityDTO } from "./dto/room-availability.dto.js";
import { RoomAvailabilityQueryDTO } from "./dto/room-availability-query.dto.js";
import { CreateRateRuleDTO } from "./dto/create-rate-rule.dto.js";
import { UpdateRateRuleDTO } from "./dto/update-rate-rule.dto.js";
import { ListRateRuleQueryDTO } from "./dto/list-rate-rule-query.dto.js";

export class AvailabilityController {
  constructor(private availabilityService: AvailabilityService) {}

  listRoomCalendar = async (req: Request, res: Response) => {
    const tenantAccountId = req.user?.sub ?? "";
    if (!tenantAccountId) {
      throw new ApiError("Unauthorized.", 401);
    }

    const result = await this.availabilityService.listRoomCalendar(
      tenantAccountId,
      String(req.params.id ?? ""),
      req.query as unknown as RoomAvailabilityQueryDTO,
    );

    res.status(200).json(result);
  };

  listPublicRoomCalendar = async (req: Request, res: Response) => {
    const result = await this.availabilityService.listPublicRoomCalendar(
      String(req.params.id ?? ""),
      req.query as unknown as RoomAvailabilityQueryDTO,
    );

    res.status(200).json(result);
  };

  updateRoomAvailability = async (req: Request, res: Response) => {
    const tenantAccountId = req.user?.sub ?? "";
    if (!tenantAccountId) {
      throw new ApiError("Unauthorized.", 401);
    }

    const result = await this.availabilityService.updateRoomAvailability(
      tenantAccountId,
      String(req.params.id ?? ""),
      req.body as UpdateRoomAvailabilityDTO,
    );

    res.status(200).json(result);
  };

  createRateRule = async (req: Request, res: Response) => {
    const tenantAccountId = req.user?.sub ?? "";
    if (!tenantAccountId) {
      throw new ApiError("Unauthorized.", 401);
    }

    const result = await this.availabilityService.createRateRule(
      tenantAccountId,
      req.body as CreateRateRuleDTO,
    );

    res.status(201).json(result);
  };

  listRateRules = async (req: Request, res: Response) => {
    const tenantAccountId = req.user?.sub ?? "";
    if (!tenantAccountId) {
      throw new ApiError("Unauthorized.", 401);
    }

    const result = await this.availabilityService.listRateRules(
      tenantAccountId,
      req.query as unknown as ListRateRuleQueryDTO,
    );

    res.status(200).json(result);
  };

  updateRateRule = async (req: Request, res: Response) => {
    const tenantAccountId = req.user?.sub ?? "";
    if (!tenantAccountId) {
      throw new ApiError("Unauthorized.", 401);
    }

    const result = await this.availabilityService.updateRateRule(
      tenantAccountId,
      String(req.params.id ?? ""),
      req.body as UpdateRateRuleDTO,
    );

    res.status(200).json(result);
  };

  deleteRateRule = async (req: Request, res: Response) => {
    const tenantAccountId = req.user?.sub ?? "";
    if (!tenantAccountId) {
      throw new ApiError("Unauthorized.", 401);
    }

    const result = await this.availabilityService.deleteRateRule(
      tenantAccountId,
      String(req.params.id ?? ""),
    );

    res.status(200).json(result);
  };
}
