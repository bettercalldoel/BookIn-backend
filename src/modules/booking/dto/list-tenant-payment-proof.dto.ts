import { OrderStatus, PaymentProofStatus } from "@prisma/client";
import { Type } from "class-transformer";
import {
  Max,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";

export const TENANT_PAYMENT_PROOF_SORT_BY_VALUES = [
  "submittedAt",
  "total",
  "checkIn",
  "orderNo",
] as const;

export const TENANT_PAYMENT_PROOF_SORT_ORDER_VALUES = ["asc", "desc"] as const;

export type TenantPaymentProofSortBy =
  (typeof TENANT_PAYMENT_PROOF_SORT_BY_VALUES)[number];

export type TenantPaymentProofSortOrder =
  (typeof TENANT_PAYMENT_PROOF_SORT_ORDER_VALUES)[number];

export class ListTenantPaymentProofDTO {
  @IsOptional()
  @IsEnum(PaymentProofStatus)
  status?: PaymentProofStatus;

  @IsOptional()
  @IsEnum(OrderStatus)
  bookingStatus?: OrderStatus;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  keyword?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsIn(TENANT_PAYMENT_PROOF_SORT_BY_VALUES)
  sortBy: TenantPaymentProofSortBy = "submittedAt";

  @IsOptional()
  @IsIn(TENANT_PAYMENT_PROOF_SORT_ORDER_VALUES)
  sortOrder: TenantPaymentProofSortOrder = "desc";

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 10;
}
