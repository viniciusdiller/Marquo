import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";
import { PlanTier } from "@marquo/database";
import { Trim } from "../../common/decorators/trim.decorator";

// O cliente só escolhe QUAL plano e, opcionalmente, o código do cupom. Preço, desconto, valor cobrado, tenant,
// e-mail do pagador e forma de pagamento (pela rota) são sempre derivados no servidor: nenhum campo de valor existe.
export class CheckoutDto {
  @IsEnum(PlanTier)
  tier!: PlanTier;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(32)
  couponCode?: string;
}

// Troca de plano: só QUAL plano. O valor novo vem do catálogo; o servidor recusa se a equipe ativa não couber.
export class ChangePlanDto {
  @IsEnum(PlanTier)
  tier!: PlanTier;
}
