import { Request, Response } from "express";
import { CatalogService } from "./catalog.service.js";
import { CatalogQueryDTO } from "./dto/catalog-query.dto.js";

const DEFAULT_LIMIT = 10;
const DEFAULT_PAGE = 1;

export class CatalogController {
  constructor(private catalogService: CatalogService) {}

  getCities = async (req: Request, res: Response) => {
    const query = req.query as unknown as CatalogQueryDTO;
    const search = String(query.search ?? "").trim();
    const limit = Number(query.limit ?? DEFAULT_LIMIT);
    const page = Number(query.page ?? DEFAULT_PAGE);
    const sortOrder = query.sortOrder === "desc" ? "desc" : "asc";
    const safeLimit =
      Number.isFinite(limit) && limit > 0 ? Math.min(limit, 20) : DEFAULT_LIMIT;
    const safePage =
      Number.isFinite(page) && page > 0 ? Math.floor(page) : DEFAULT_PAGE;

    const data = await this.catalogService.listCities(search, {
      page: safePage,
      limit: safeLimit,
      sortOrder,
    });
    res.json(data);
  };

  getCategories = async (req: Request, res: Response) => {
    const query = req.query as unknown as CatalogQueryDTO;
    const search = String(query.search ?? "").trim();
    const limit = Number(query.limit ?? DEFAULT_LIMIT);
    const page = Number(query.page ?? DEFAULT_PAGE);
    const sortOrder = query.sortOrder === "desc" ? "desc" : "asc";
    const safeLimit =
      Number.isFinite(limit) && limit > 0 ? Math.min(limit, 20) : DEFAULT_LIMIT;
    const safePage =
      Number.isFinite(page) && page > 0 ? Math.floor(page) : DEFAULT_PAGE;
    const tenantAccountId = req.user?.sub ?? "";

    const data = await this.catalogService.listCategories(
      tenantAccountId,
      search,
      {
        page: safePage,
        limit: safeLimit,
        sortOrder,
      },
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

  updateCategory = async (req: Request, res: Response) => {
    const tenantAccountId = req.user?.sub ?? "";
    const { name } = req.body as { name: string };
    const categoryId = String(req.params.id ?? "");

    const result = await this.catalogService.updateCategory(
      tenantAccountId,
      categoryId,
      name,
    );

    res.status(200).json(result);
  };

  deleteCategory = async (req: Request, res: Response) => {
    const tenantAccountId = req.user?.sub ?? "";
    const categoryId = String(req.params.id ?? "");

    const result = await this.catalogService.deleteCategory(
      tenantAccountId,
      categoryId,
    );

    res.status(200).json(result);
  };
}
