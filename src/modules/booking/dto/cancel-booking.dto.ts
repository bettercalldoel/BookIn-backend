import { IsEnum } from "class-validator";
import { CancelledBy } from "@prisma/client";

export class CancelBookingDTO {
  @IsEnum(CancelledBy)
  cancelledBy!: CancelledBy;
}
