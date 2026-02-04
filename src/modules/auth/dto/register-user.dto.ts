import {
  IsEmail,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from "class-validator";

export class RegisterUserDTO {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsUrl()
  avatarUrl?: string;
}
