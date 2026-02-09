import { IsUUID } from "class-validator";

export class PaymentProofIdParamDTO {
  @IsUUID()
  id!: string;
}
