import { IsOptional, IsString, IsUrl, MaxLength } from "class-validator";

export class UpdateProfileDTO {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsUrl()
  avatarUrl?: string;
}
