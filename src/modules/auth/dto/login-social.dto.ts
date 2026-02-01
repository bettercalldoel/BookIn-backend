import { IsEnum, IsNotEmpty, IsString } from "class-validator";
import { AuthProvider } from "@prisma/client";

export class LoginSocialDTO {
  @IsEnum(AuthProvider)
  provider!: AuthProvider;

  @IsNotEmpty()
  @IsString()
  providerUserId!: string;
}
