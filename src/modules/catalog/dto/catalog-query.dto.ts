import {
  IsNumberString,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";

export class CatalogQueryDTO {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsNumberString()
  limit?: string;
}
