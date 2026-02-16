import { IsNotEmpty, IsString, MaxLength } from "class-validator";

export class UpdateCategoryDTO {
  @IsNotEmpty()
  @IsString()
  @MaxLength(120)
  name!: string;
}
