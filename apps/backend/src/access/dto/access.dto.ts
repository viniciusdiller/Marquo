import { IsBoolean, IsEmail, IsObject, IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";
import { Trim } from "../../common/decorators/trim.decorator";
import { NormalizeEmail } from "../../common/decorators/normalize-email.decorator";

// `permissions` chega como { area: "NONE" | "VIEW" | "EDIT" }. O formato (áreas e níveis conhecidos) é conferido no service, que também
// RECUSA área ou nível desconhecido em vez de ignorar: um erro de digitação não pode virar acesso nem perda de acesso em silêncio.
export class CreateAccessProfileDto {
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name!: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(200)
  description?: string;

  @IsObject()
  permissions!: Record<string, unknown>;
}

export class UpdateAccessProfileDto {
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(200)
  description?: string;

  @IsOptional()
  @IsObject()
  permissions?: Record<string, unknown>;
}

// Pessoa da equipe SEM agenda própria (recepção, caixa...). Quem atende é cadastrado em Profissionais. Papel, negócio e e-mail
// confirmado são definidos pelo servidor; aqui só o que o dono escolhe.
export class CreateAccessUserDto {
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @NormalizeEmail()
  @IsEmail()
  @MaxLength(254)
  email!: string;

  // 72: o bcrypt só considera os primeiros 72 bytes. Sem @Trim: espaço nas bordas de senha é legítimo.
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;

  @IsUUID()
  profileId!: string;
}

export class UpdateAccessUserDto {
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsUUID()
  profileId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ResetAccessUserPasswordDto {
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;
}
