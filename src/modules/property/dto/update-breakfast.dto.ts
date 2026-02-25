import { Type } from "class-transformer";
import { IsBoolean, IsNumber, Min } from "class-validator";

export class UpdatePropertyBreakfastDTO {
  @Type(() => Boolean)
  @IsBoolean()
  breakfastEnabled!: boolean;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(0)
  breakfastPricePerPax!: number;
}
