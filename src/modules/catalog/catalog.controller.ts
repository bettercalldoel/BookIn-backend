import { Request, Response } from "express";
import { CatalogService } from "./catalog.service.js";

const DEFAULT_LIMIT = 10;

export class CatalogController {
  constructor(private catalogService: CatalogService) {}

  getCities = async (req: Request, res: Response) => {
    const search = String(req.query.search ?? "").trim();
    const limit = Number(req.query.limit ?? DEFAULT_LIMIT);
    const safeLimit =
      Number.isFinite(limit) && limit > 0 ? Math.min(limit, 20) : DEFAULT_LIMIT;

    const data = await this.catalogService.listCities(search, safeLimit);
    res.json(data);
  };

  getCategories = async (req: Request, res: Response) => {
    const search = String(req.query.search ?? "").trim();
    const limit = Number(req.query.limit ?? DEFAULT_LIMIT);
    const safeLimit =
      Number.isFinite(limit) && limit > 0 ? Math.min(limit, 20) : DEFAULT_LIMIT;
    const tenantAccountId = req.user?.sub ?? "";

    const data = await this.catalogService.listCategories(
      tenantAccountId,
      search,
      safeLimit,
    );
    res.json(data);
  };

  createCategory = async (req: Request, res: Response) => {
    const tenantAccountId = req.user?.sub ?? "";
    const { name } = req.body as { name: string };

    const result = await this.catalogService.createCategory(
      tenantAccountId,
      name,
    );

    res.status(201).json(result);
  };
}
