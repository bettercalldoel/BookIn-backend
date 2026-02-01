import { IsNotEmpty, IsString, MinLength } from "class-validator";

export class ConfirmPasswordResetDTO {
  @IsNotEmpty()
  @IsString()
  token!: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(8)
  newPassword!: string;
}
