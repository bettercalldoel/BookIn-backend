import { Type } from "class-transformer";
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";

export const TENANT_SALES_REPORT_VIEW_VALUES = [
  "transaction",
  "property",
  "user",
] as const;

export const TENANT_SALES_REPORT_SORT_BY_VALUES = ["date", "total"] as const;

export const TENANT_SALES_REPORT_SORT_ORDER_VALUES = ["asc", "desc"] as const;

export type TenantSalesReportView =
  (typeof TENANT_SALES_REPORT_VIEW_VALUES)[number];

export type TenantSalesReportSortBy =
  (typeof TENANT_SALES_REPORT_SORT_BY_VALUES)[number];

export type TenantSalesReportSortOrder =
  (typeof TENANT_SALES_REPORT_SORT_ORDER_VALUES)[number];

export class ListTenantSalesReportDTO {
  @IsOptional()
  @IsIn(TENANT_SALES_REPORT_VIEW_VALUES)
  view: TenantSalesReportView = "transaction";

  @IsOptional()
  @IsIn(TENANT_SALES_REPORT_SORT_BY_VALUES)
  sortBy: TenantSalesReportSortBy = "date";

  @IsOptional()
  @IsIn(TENANT_SALES_REPORT_SORT_ORDER_VALUES)
  sortOrder: TenantSalesReportSortOrder = "desc";

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  keyword?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit: number = 10;
}
