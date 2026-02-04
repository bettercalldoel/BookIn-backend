import { IsUUID } from "class-validator";

export class RoomTypeIdParamDTO {
  @IsUUID()
  id!: string;
}
