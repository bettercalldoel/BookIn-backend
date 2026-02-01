import { IsUUID } from "class-validator";

export class PropertyIdParamDTO {
  @IsUUID()
  id!: string;
}
