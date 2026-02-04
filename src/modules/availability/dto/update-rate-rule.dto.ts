import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumberString,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";
import { AdjustmentType } from "@prisma/client";

export class UpdateRateRuleDTO {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsEnum(AdjustmentType)
  adjustmentType?: AdjustmentType;

  @IsOptional()
  @IsNumberString()
  adjustmentValue?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
