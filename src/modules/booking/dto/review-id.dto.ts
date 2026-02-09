import { IsUUID } from "class-validator";

export class ReviewIdParamDTO {
  @IsUUID()
  id!: string;
}
