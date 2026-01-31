import { IsOptional, IsString } from "class-validator";

export class RejectBookingDTO {
  @IsOptional()
  @IsString()
  reason?: string;
}
