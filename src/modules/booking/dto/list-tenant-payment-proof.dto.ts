import { PaymentProofStatus } from "@prisma/client";
import { IsEnum, IsOptional } from "class-validator";

export class ListTenantPaymentProofDTO {
  @IsOptional()
  @IsEnum(PaymentProofStatus)
  status?: PaymentProofStatus;
}
