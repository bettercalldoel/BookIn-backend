import { IsEnum, IsIn, IsOptional, IsUUID } from "class-validator";
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
}
