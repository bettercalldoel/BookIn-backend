import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  Min,
} from "class-validator";

export class UpdateRoomAvailabilityDTO {
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

  @IsBoolean()
  isClosed!: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  availableUnits?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  closeUnits?: number;
}
