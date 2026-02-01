import { IsNotEmpty, IsString, MaxLength } from "class-validator";

export class CreateCategoryDTO {
  @IsNotEmpty()
  @IsString()
  @MaxLength(120)
  name!: string;
}
