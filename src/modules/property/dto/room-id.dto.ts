import { IsUUID } from "class-validator";

export class RoomIdParamDTO {
  @IsUUID()
  id!: string;
}
