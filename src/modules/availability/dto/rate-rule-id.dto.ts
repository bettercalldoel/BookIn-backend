import { IsUUID } from "class-validator";

export class RateRuleIdParamDTO {
  @IsUUID()
  id!: string;
}
