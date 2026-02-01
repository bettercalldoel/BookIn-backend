import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from "class-validator";

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
}
