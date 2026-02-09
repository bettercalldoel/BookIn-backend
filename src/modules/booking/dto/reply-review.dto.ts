import { IsNotEmpty, IsString, MaxLength } from "class-validator";

export class ReplyReviewDTO {
  @IsNotEmpty()
  @IsString()
  @MaxLength(1200)
  reply!: string;
}
