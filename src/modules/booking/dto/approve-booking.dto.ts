import { IsUUID } from "class-validator";

export class ApproveBookingDTO {
  @IsUUID()
  tenantId!: string;
}
