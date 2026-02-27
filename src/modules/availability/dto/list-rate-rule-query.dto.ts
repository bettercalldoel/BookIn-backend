import { Type } from "class-transformer";
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { RateScope } from "@prisma/client";

export class ListRateRuleQueryDTO {
  @IsOptional()
  @IsEnum(RateScope)
  scope?: RateScope;

  @IsOptional()
  @IsUUID()
  propertyId?: string;

  @IsOptional()
  @IsUUID()
  roomTypeId?: string;

  @IsOptional()
  @IsIn(["true", "false"])
  isActive?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  keyword?: string;

  @IsOptional()
  @IsIn(["startDate", "endDate", "name", "createdAt"])
  sortBy?: "startDate" | "endDate" | "name" | "createdAt";

  @IsOptional()
  @IsIn(["asc", "desc"])
  sortOrder?: "asc" | "desc";

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
  limit: number = 20;
}
