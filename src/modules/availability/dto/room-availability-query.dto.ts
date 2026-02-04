import { IsDateString } from "class-validator";

export class RoomAvailabilityQueryDTO {
  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;
}
