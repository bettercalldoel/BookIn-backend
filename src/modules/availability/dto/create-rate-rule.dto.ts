import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from "class-validator";
import { AdjustmentType, RateScope } from "@prisma/client";

export class CreateRateRuleDTO {
  @IsNotEmpty()
  @IsString()
  @MaxLength(160)
  name!: string;

  @IsEnum(RateScope)
  scope!: RateScope;

  @IsOptional()
  @IsUUID()
  propertyId?: string;

  @IsOptional()
  @IsUUID()
  roomTypeId?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsArray()
  @IsDateString({}, { each: true })
  dates?: string[];

  @IsEnum(AdjustmentType)
  adjustmentType!: AdjustmentType;

  @IsNotEmpty()
  @IsNumberString()
  adjustmentValue!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
