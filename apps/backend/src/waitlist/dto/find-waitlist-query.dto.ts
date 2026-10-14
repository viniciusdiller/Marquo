import { IsEnum, IsOptional } from "class-validator";
import { WaitlistStatus } from "@marquo/database";

export class FindWaitlistQueryDto {
  @IsOptional()
  @IsEnum(WaitlistStatus)
  status?: WaitlistStatus;
}
