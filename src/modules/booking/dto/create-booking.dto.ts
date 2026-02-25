import { PaymentMethod } from "@prisma/client";
import { Type } from "class-transformer";
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Min,
  ValidateIf,
} from "class-validator";

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

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  breakfastSelected?: boolean;

  @ValidateIf((input: CreateBookingDTO) => input.breakfastSelected === true)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  breakfastPax?: number;
}
