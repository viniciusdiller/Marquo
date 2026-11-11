import { Trim } from "../../common/decorators/trim.decorator";
import { IsDateString, IsIn, IsOptional, IsString, Matches, MaxLength, IsUUID } from "class-validator";

export class CreateTimeBlockDto {
  @IsUUID()
  professionalId!: string;

  @IsDateString()
  startAt!: string;

  @IsDateString()
  endAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Trim()
  reason?: string;

  // "Todo dia": a janela de hora de startAt/endAt repete a cada dia a partir do dia de startAt. Omitido = bloqueio único.
  @IsOptional()
  @IsIn(["NONE", "DAILY"])
  repeat?: "NONE" | "DAILY";

  // Último dia da repetição (yyyy-MM-dd, inclusive). Omitido = sem data final. Só vale com repeat = DAILY.
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "repeatUntil deve estar no formato yyyy-MM-dd." })
  repeatUntil?: string;
}
