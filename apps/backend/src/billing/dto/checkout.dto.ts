import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";
import { PlanTier } from "@marquo/database";
import { Trim } from "../../common/decorators/trim.decorator";
import { IsCpfOrCnpj } from "../../common/validators/br-validators";

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

// Iniciar a cobrança (cartão ou Pix): além do plano e do cupom, o documento do pagador. O Asaas só emite cobrança para
// cliente com CPF/CNPJ, e o Marquo não guarda esse dado: ele vai direto ao provedor, sem ficar no nosso banco.
export class StartCheckoutDto extends CheckoutDto {
  @Trim()
  @IsString()
  @IsCpfOrCnpj()
  cpfCnpj!: string;
}

// Troca de plano: só QUAL plano. O valor novo vem do catálogo; o servidor recusa se a equipe ativa não couber.
export class ChangePlanDto {
  @IsEnum(PlanTier)
  tier!: PlanTier;
}
