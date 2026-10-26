import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { CouponKind, PlanTier, Role, SubscriptionStatus } from "@marquo/database";
import { PaginationQueryDto } from "../../common/pagination/pagination-query.dto";
import { MAX_PLAN_PRICE_CENTS } from "../../billing/payments/pricing";
import { NormalizeEmail } from "../../common/decorators/normalize-email.decorator";
import { IsBrazilianPhone } from "../../common/validators/br-validators";

const trim = ({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value);

export class PlatformLoginDto {
  @Transform(trim)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  // 72 = limite do bcrypt (o resto seria ignorado em silêncio).
  @IsString()
  @IsNotEmpty()
  @MaxLength(72)
  password!: string;
}

// Segunda etapa do login com 2FA. challengeId é o identificador opaco (24 bytes em hex) devolvido pelo login.
export class PlatformVerifyCodeDto {
  @IsString()
  @Matches(/^[0-9a-f]{48}$/, { message: "Desafio inválido." })
  challengeId!: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: "O código tem 6 dígitos." })
  code!: string;
}

// Filtros de estado de cobrança da lista de negócios. "SUSPENDED" e os estados calculados
// (TRIALING/TRIAL_EXPIRED) não existem como coluna: o service os traduz em cláusulas WHERE.
export const TENANT_STATUS_FILTERS = [
  "TRIALING",
  "TRIAL_EXPIRED",
  "SUSPENDED",
  ...Object.values(SubscriptionStatus),
] as const;
export type TenantStatusFilter = (typeof TENANT_STATUS_FILTERS)[number];

export class PlatformTenantsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsIn(TENANT_STATUS_FILTERS)
  status?: TenantStatusFilter;
}

export const TRIAL_STATUS_FILTERS = ["ACTIVE", "EXPIRED"] as const;

// Lista do teste grátis: só negócios sem assinatura. status = ainda em teste (ACTIVE) ou vencido (EXPIRED).
export class PlatformTrialsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsIn(TRIAL_STATUS_FILTERS)
  status?: (typeof TRIAL_STATUS_FILTERS)[number];
}

// Quanto teste o negócio tem a partir de HOJE (0 encerra agora). A data final é calculada no servidor.
export class SetTrialDto {
  @IsInt()
  @Min(0)
  @Max(365)
  days!: number;
}

// Novo preço mensal do plano, em centavos. O servidor limita entre o piso da cobrança e o teto do plano.
export class SetPlanPriceDto {
  @IsInt()
  @Min(1)
  @Max(MAX_PLAN_PRICE_CENTS)
  priceCents!: number;
}

export class PlatformUsersQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}

export class PlatformSubscriptionsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(SubscriptionStatus)
  status?: SubscriptionStatus;
}

export class PlatformAuditQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  tenantId?: string;
}

export class SuspendTenantDto {
  // Motivo obrigatório: vai para a trilha de auditoria e para o suporte entender o bloqueio depois.
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason!: string;
}

export class ExtendTrialDto {
  @IsInt()
  @Min(1)
  @Max(90)
  days!: number;
}

// Cadastro de um negócio feito pela plataforma. NÃO há campo de senha, papel, plano, trial nem tenantId:
// o dono recebe um link para definir a própria senha (o admin nunca a conhece) e o servidor fixa o resto.
export class CreatePlatformTenantDto {
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  businessName!: string;

  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  ownerName!: string;

  @NormalizeEmail()
  @IsEmail()
  @MaxLength(254)
  ownerEmail!: string;

  @IsBrazilianPhone()
  ownerPhone!: string;
}

// Cortesia: o plano é liberado sem cobrança. Sem `days` = sem data de fim (até a plataforma remover).
export class GrantCourtesyDto {
  @IsEnum(PlanTier)
  tier!: PlanTier;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(730)
  days?: number;
}

export class CreateCouponDto {
  // Normalizado (maiúsculo) e validado no service: TRIM + upper antes do padrão.
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toUpperCase() : value))
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  code!: string;

  @IsEnum(CouponKind)
  kind!: CouponKind;

  // A faixa depende do tipo (dias / % / centavos): conferida no service (couponValueError).
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  value!: number;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  maxRedemptions?: number;

  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @IsOptional()
  @IsDateString()
  validUntil?: string;
}

export class UpdateCouponDto {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  maxRedemptions?: number;

  // Novo fim de validade (o início e o tipo/valor NÃO mudam depois de criado: quem já resgatou contou
  // com aquelas condições).
  @IsOptional()
  @IsDateString()
  validUntil?: string;
}

export class PlatformCouponsQueryDto extends PaginationQueryDto {}

export class UpdateOwnerPhoneDto {
  @IsBrazilianPhone()
  phone!: string;
}

// Confirmação da exclusão dos dados de um negócio. `confirmSlug` é o endereço digitado; o service compara com o do banco.
export class DeleteTenantDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  confirmSlug!: string;

  // Obrigatório só quando o prazo de 90 dias ainda não terminou (exclusão antecipada). Sem dado pessoal: vai para a auditoria.
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class PlatformDeletionQueryDto extends PaginationQueryDto {}
