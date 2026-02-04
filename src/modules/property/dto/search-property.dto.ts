import {
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
