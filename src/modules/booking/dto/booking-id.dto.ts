import { IsUUID } from "class-validator";

export class BookingIdParamDTO {
  @IsUUID()
  id!: string;
}
