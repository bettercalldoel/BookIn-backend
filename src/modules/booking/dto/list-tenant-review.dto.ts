import { Type } from "class-transformer";
import {
  IsBooleanString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Max,
  Min,
} from "class-validator";

export class ListTenantReviewDTO {
  @IsOptional()
  @IsBooleanString()
  replied?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  keyword?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @IsOptional()
  @IsIn(["createdAt", "rating"])
  sortBy?: "createdAt" | "rating";

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
  limit: number = 10;
}
