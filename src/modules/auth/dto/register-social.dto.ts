import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";
import { AccountType, AuthProvider } from "@prisma/client";

export class RegisterSocialDTO {
  @IsEnum(AuthProvider)
  provider!: AuthProvider;

  @IsNotEmpty()
  @IsString()
  providerUserId!: string;

  @IsEmail()
  email!: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(150)
  name!: string;

  @IsEnum(AccountType)
  accountType!: AccountType;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  companyName?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;
}
