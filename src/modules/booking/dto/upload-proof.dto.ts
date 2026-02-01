import { IsOptional, IsString } from "class-validator";

export class UploadPaymentProofDTO {
  @IsOptional()
  @IsString()
  note?: string;
}
