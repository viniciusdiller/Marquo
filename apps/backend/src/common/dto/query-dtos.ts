import { IsIn, IsISO8601, IsOptional, IsString, MaxLength, IsUUID } from "class-validator";
import { PaginationQueryDto } from "../pagination/pagination-query.dto";

// @Query("campo") solto não passa pelo ValidationPipe: `?professionalId[a]=b` ou
// `?search=a&search=b` chegam como objeto/array, vão cru pro Prisma/`.trim()` e viram 500 em
// vez de 400. Estes DTOs fecham essa fronteira (mesmo padrão de PaginationQueryDto).

export class ClientSearchQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

export class DateRangeQueryDto {
  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;
}

export class RequiredDateRangeQueryDto {
  @IsISO8601()
  from!: string;

  @IsISO8601()
  to!: string;
}

// professionalId é só FILTRO adicional: quem é PROFESSIONAL tem o valor sobrescrito pelo do JWT
// no controller/service, nunca é fonte de autorização.
export class RangeByProfessionalQueryDto extends RequiredDateRangeQueryDto {
  @IsOptional()
  @IsUUID()
  professionalId?: string;
}

export class TimeBlocksQueryDto {
  @IsUUID()
  professionalId!: string;
}

// Financeiro: mesmos parâmetros que antes eram @Query("...") soltos. Valor fora da lista agora é 400
// (antes direction/status/basis inválidos eram ignorados em silêncio e devolviam tudo).
export class ListEntriesQueryDto extends DateRangeQueryDto {
  @IsOptional()
  @IsIn(["INCOME", "EXPENSE"])
  direction?: "INCOME" | "EXPENSE";

  @IsOptional()
  @IsIn(["PENDING", "PAID", "CANCELED"])
  status?: "PENDING" | "PAID" | "CANCELED";

  @IsOptional()
  @IsIn(["due", "paid"])
  basis?: "due" | "paid";
}

export class CashFlowQueryDto extends RequiredDateRangeQueryDto {
  @IsOptional()
  @IsIn(["due", "paid"])
  basis?: "due" | "paid";
}
