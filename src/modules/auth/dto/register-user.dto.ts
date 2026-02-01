import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from "class-validator";

export class RegisterUserDTO {
  @IsEmail()
  email!: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(150)
  name!: string;

  @IsOptional()
  @IsUrl()
  avatarUrl?: string;
}
