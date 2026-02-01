import {
  IsNotEmpty,
  IsNumberString,
  IsString,
  MaxLength,
} from "class-validator";

export class UpdateRoomDTO {
  @IsNotEmpty()
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsNotEmpty()
  @IsString()
  description!: string;

  @IsNotEmpty()
  @IsNumberString()
  price!: string;

  @IsNotEmpty()
  @IsNumberString()
  totalUnits!: string;

  @IsNotEmpty()
  @IsNumberString()
  maxGuests!: string;
}
