import { IsEnum, IsOptional } from "class-validator";
import { CancelledBy } from "@prisma/client";

export class CancelBookingDTO {
  @IsOptional()
  @IsEnum(CancelledBy)
  cancelledBy: CancelledBy = CancelledBy.USER;
}
