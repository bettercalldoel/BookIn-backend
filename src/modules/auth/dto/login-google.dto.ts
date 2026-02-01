import { IsEnum, IsNotEmpty, IsOptional, IsString } from "class-validator";
import { AccountType } from "@prisma/client";

export class LoginGoogleDTO {
  @IsNotEmpty()
  @IsString()
  idToken!: string;

  @IsOptional()
  @IsEnum(AccountType)
  accountType?: AccountType;
}
