import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { CLUB_MAX_PLAN_SERVICES, CLUB_MAX_PRICE_CENTS, CLUB_MAX_USES_PER_MONTH } from "@marquo/shared-types";
import { Trim } from "../../common/decorators/trim.decorator";
import { PaginationQueryDto } from "../../common/pagination/pagination-query.dto";

export class SetClubEnabledDto {
  @IsBoolean()
  enabled!: boolean;
}

// Pacote do clube. Preço e usos são decisão do dono (valor legítimo vindo do cliente HTTP), com teto no servidor; os serviços
// só entram se forem DO negócio (conferido no service). Nada aqui define tenant, estado nem datas.
export class CreateClubPlanDto {
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(300)
  description?: string;

  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(CLUB_MAX_PRICE_CENTS)
  priceCents!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(CLUB_MAX_USES_PER_MONTH)
  usesPerMonth!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(CLUB_MAX_PLAN_SERVICES)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  serviceIds!: string[];
}

// Só o que não muda as regras de quem já entrou. Usos por mês e serviços ficam fixos: para mudar, cria outro pacote.
export class UpdateClubPlanDto {
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(300)
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(CLUB_MAX_PRICE_CENTS)
  priceCents?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class EnrollClubMemberDto {
  @IsUUID()
  clientId!: string;

  @IsUUID()
  planId!: string;
}

export enum ClubMemberStateFilter {
  ACTIVE = "ACTIVE",
  EXPIRED = "EXPIRED",
  CANCELED = "CANCELED",
}

export class FindClubMembersQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(ClubMemberStateFilter)
  state?: ClubMemberStateFilter;
}
