import { IsEnum } from "class-validator";
import { WaitlistStatus } from "@marquo/database";

export class UpdateWaitlistStatusDto {
  @IsEnum(WaitlistStatus)
  status!: WaitlistStatus;
}
