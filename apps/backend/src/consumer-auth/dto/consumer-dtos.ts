import { NormalizeEmail } from "../../common/decorators/normalize-email.decorator";
import { IsBrazilianPhone } from "../../common/validators/br-validators";
import { Trim } from "../../common/decorators/trim.decorator";
import { IsBoolean, IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";

// 72 = limite de entrada do bcrypt (bytes além disso são ignorados silenciosamente, então
// senha mais longa daria falsa sensação de segurança).
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 72;

export class RegisterConsumerDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  @Trim()
  name!: string;

  @IsBrazilianPhone()
  phone!: string;

  @IsEmail()
  @MaxLength(254)
  @NormalizeEmail()
  email!: string;

  @IsString()
  @MinLength(PASSWORD_MIN)
  @MaxLength(PASSWORD_MAX)
  password!: string;

  // Aceite explícito dos termos/privacidade — obrigatório (LGPD). Este DTO também reivindica
  // conta antiga (telefone que já tinha cadastro sem senha): ver ConsumerAuthService.register.
  @IsBoolean()
  consent!: boolean;

  // Código de 6 dígitos enviado ao e-mail acima (POST /public/consumer/register/code). Obrigatório quando o e-mail do
  // sistema está configurado: a regra vive no service (o DTO só confere o formato).
  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/, { message: "O código tem 6 dígitos." })
  emailCode?: string;
}

export class RequestRegisterCodeDto {
  @IsEmail()
  @MaxLength(254)
  @NormalizeEmail()
  email!: string;
}

// Telefone ou e-mail. Sem @IsEmail/regra de telefone de propósito: um formato inválido tem que
// cair no mesmo 401 genérico de "senha errada", não num 400 que diferencia os casos.
export class ConsumerLoginDto {
  @IsString()
  @MinLength(3)
  @MaxLength(254)
  @Trim()
  identifier!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(PASSWORD_MAX)
  password!: string;
}

export class UpdateConsumerProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  @Trim()
  name?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  @NormalizeEmail()
  email?: string;
}

export class ChangeConsumerPasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(PASSWORD_MAX)
  currentPassword!: string;

  @IsString()
  @MinLength(PASSWORD_MIN)
  @MaxLength(PASSWORD_MAX)
  newPassword!: string;
}
