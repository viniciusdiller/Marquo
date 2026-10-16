import { Trim } from "../../common/decorators/trim.decorator";
import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { NormalizeEmail } from "../../common/decorators/normalize-email.decorator";
import { IsBrazilianPhone } from "../../common/validators/br-validators";

// Todo campo aqui vem de um formulário público sem login: nada disso é confiável. Não há campo de
// plano, preço, papel, tenantId nem trial — o servidor define tudo isso (papel OWNER, trial
// TRIAL_DAYS, sem assinatura). `forbidNonWhitelisted` rejeita qualquer campo a mais.
export class SignupDto {
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  businessName!: string;

  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  ownerName!: string;

  @NormalizeEmail()
  @IsEmail()
  @MaxLength(254)
  email!: string;

  // Telefone do dono (DDD + número, qualquer formatação): contato comercial da plataforma, por exemplo
  // para falar com quem cancela. Normalizado no servidor; nunca é identidade de login.
  @IsBrazilianPhone()
  phone!: string;

  // 72: o bcrypt só considera os primeiros 72 bytes; recusar acima disso evita a ilusão de que
  // uma senha longa foi toda usada.
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;

  // Cupom de campanha (opcional). O servidor normaliza, valida e resgata; o cliente nunca informa dias nem
  // desconto, só o código.
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(32)
  couponCode?: string;

  // Versão dos Termos/Privacidade que o usuário viu ao marcar o aceite. Não é "true/false": o
  // servidor exige que seja EXATAMENTE a vigente (LEGAL_DOCS_VERSION), então quem tem a página
  // aberta com um texto antigo é obrigado a recarregar e aceitar de novo.
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  acceptedTermsVersion!: string;
}
