import {
  IsIn,
  IsNumberString,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";

export class ListPublicCategoryQueryDTO {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsNumberString()
  page?: string;

  @IsOptional()
  @IsNumberString()
  limit?: string;

  @IsOptional()
  @IsString()
  @IsIn(["name"])
  sortBy?: string;

  @IsOptional()
  @IsString()
  @IsIn(["asc", "desc"])
  sortOrder?: string;
}
