import { IsNotEmpty, IsOptional, IsString, MinLength } from "class-validator";

export class VerifyEmailDTO {
  @IsNotEmpty()
  @IsString()
  token!: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  currentPassword?: string;
}
