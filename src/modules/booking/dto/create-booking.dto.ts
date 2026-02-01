import { IsUUID, IsDateString, IsInt, Min } from "class-validator";

export class CreateBookingDTO {
  @IsUUID()
  propertyId!: string;

  @IsUUID()
  roomTypeId!: string;

  @IsDateString()
  checkIn!: string;

  @IsDateString()
  checkOut!: string;

  @IsInt()
  @Min(1)
  guests!: number;

  @IsInt()
  @Min(1)
  rooms!: number;
}
