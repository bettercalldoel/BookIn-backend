import { IsNotEmpty, IsNumberString } from "class-validator";

export class CategoryIdParamDTO {
  @IsNotEmpty()
  @IsNumberString()
  id!: string;
}
