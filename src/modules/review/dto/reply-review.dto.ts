import { IsString } from "class-validator";

export class ReplyReviewDTO {
  @IsString()
  reply!: string;
}
