import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsEnum, IsInt, Max, Min, ValidateNested } from "class-validator";
import { Weekday } from "@marquo/database";

export class WorkingHoursIntervalDto {
  @IsEnum(Weekday)
  weekday!: Weekday;

  @IsInt()
  @Min(0)
  @Max(1439)
  startMinute!: number;

  @IsInt()
  @Min(1)
  @Max(1440)
  endMinute!: number;
}

export class SetWorkingHoursDto {
  @ValidateNested({ each: true })
  @Type(() => WorkingHoursIntervalDto)
  @ArrayMinSize(0)
  @ArrayMaxSize(50)
  intervals!: WorkingHoursIntervalDto[];
}
