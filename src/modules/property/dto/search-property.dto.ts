import {
  IsIn,
  IsDateString,
  IsNumberString,
  IsOptional,
  IsString,
} from "class-validator";

export class SearchPropertyQueryDTO {
  @IsOptional()
  @IsString()
  loc_term?: string;

  @IsOptional()
  @IsString()
  property_name?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsIn(["name", "price"])
  sort_by?: "name" | "price";

  @IsOptional()
  @IsIn(["asc", "desc"])
  sort_order?: "asc" | "desc";

  @IsOptional()
  @IsDateString()
  start_date?: string;

  @IsOptional()
  @IsDateString()
  end_date?: string;

  @IsOptional()
  @IsNumberString()
  adults?: string;

  @IsOptional()
  @IsNumberString()
  children?: string;

  @IsOptional()
  @IsNumberString()
  rooms?: string;

  @IsOptional()
  @IsNumberString()
  page?: string;

  @IsOptional()
  @IsNumberString()
  limit?: string;

  @IsOptional()
  @IsString()
  lat?: string;

  @IsOptional()
  @IsString()
  lng?: string;

  @IsOptional()
  @IsString()
  country?: string;
}
