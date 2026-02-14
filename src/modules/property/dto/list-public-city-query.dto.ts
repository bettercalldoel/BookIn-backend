import {
  IsNumberString,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";

export class ListPublicCityQueryDTO {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsNumberString()
  limit?: string;
}
