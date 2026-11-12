import { IsEnum, IsOptional, IsString, Matches, MaxLength } from "class-validator";
import { PlanTier } from "@marquo/database";
import { Trim } from "../../common/decorators/trim.decorator";
import { IsBrazilianPhone, IsCpfOrCnpj } from "../../common/validators/br-validators";

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

// Iniciar a cobrança (cartão ou Pix): além do plano e do cupom, os dados do pagador. Tudo opcional no corpo: o que não vier
// sai do cadastro de cobrança salvo do negócio, e o servidor devolve 400 listando o que ainda falta (o cartão exige
// documento, telefone e endereço; o Pix só o documento). O CPF/CNPJ é guardado criptografado, nunca em claro.
export class StartCheckoutDto extends CheckoutDto {
  @IsOptional()
  @Trim()
  @IsString()
  @IsCpfOrCnpj()
  cpfCnpj?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @IsBrazilianPhone()
  phone?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @Matches(/^\d{5}-?\d{3}$/, { message: "CEP inválido. Informe os 8 dígitos." })
  postalCode?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(120)
  address?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(20)
  addressNumber?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(80)
  complement?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(80)
  province?: string;
}

// Troca de plano: QUAL plano (e, só se o negócio ainda não tem cliente no provedor, o documento de quem paga a diferença de um
// upgrade). O valor novo e a diferença vêm do servidor; ele recusa se a equipe ativa não couber no plano menor.
export class ChangePlanDto {
  @IsEnum(PlanTier)
  tier!: PlanTier;

  @IsOptional()
  @Trim()
  @IsString()
  @IsCpfOrCnpj()
  cpfCnpj?: string;
}
