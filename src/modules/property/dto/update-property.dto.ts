import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsBoolean,
  IsNumber,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { Type } from "class-transformer";
import { PROPERTY_AMENITY_KEYS } from "../property-amenities.js";

export class UpdatePropertyDTO {
  @IsNotEmpty()
  @IsString()
  @MaxLength(160)
  name!: string;

  @IsNotEmpty()
  @IsString()
  description!: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 7 })
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 7 })
  @Min(-180)
  @Max(180)
  longitude?: number;

  @IsNotEmpty()
  @IsNumberString()
  categoryId!: string;

  @IsNotEmpty()
  @IsNumberString()
  cityId!: string;

  @IsNotEmpty()
  @IsUrl()
  coverUrl!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @IsUrl({}, { each: true })
  galleryUrls!: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(64)
  @ArrayUnique()
  @IsIn(PROPERTY_AMENITY_KEYS, { each: true })
  amenityKeys?: string[];

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  breakfastEnabled?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(0)
  breakfastPricePerPax?: number;
}
