import { IsOptional, IsString, MaxLength } from "class-validator";

export class ReviewPaymentProofDTO {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
