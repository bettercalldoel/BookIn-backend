import { IsOptional, IsEnum, IsInt, Min } from "class-validator";
import { OrderStatus } from "@prisma/client";

export class ListBookingDTO {
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  limit: number = 10;
}
