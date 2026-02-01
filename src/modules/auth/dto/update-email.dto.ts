import { IsEmail, IsNotEmpty, IsString } from "class-validator";

export class UpdateEmailDTO {
  @IsNotEmpty()
  @IsString()
  @IsEmail()
  email!: string;
}
