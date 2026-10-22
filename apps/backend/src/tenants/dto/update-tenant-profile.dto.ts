import { Trim } from "../../common/decorators/trim.decorator";
import { IsBoolean, IsInt, IsOptional, IsString, Matches, MaxLength, Min, ValidateIf } from "class-validator";

export class UpdateTenantProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Trim()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  @Trim()
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Trim()
  businessHours?: string;

  // Nos três campos abaixo, vazio limpa o valor (o service grava null); o formato só é conferido
  // quando há valor.
  @IsOptional()
  @ValidateIf((o) => !!o.accentColor)
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: "Cor inválida. Use o formato #RRGGBB." })
  accentColor?: string;

  // Vira link wa.me na página pública: só número brasileiro com DDI (55 + DDD + 8/9 dígitos).
  @IsOptional()
  @ValidateIf((o) => !!o.whatsappNumber)
  @Matches(/^55[1-9][1-9]\d{8,9}$/, {
    message: "WhatsApp inválido. Informe DDD e número (ex: (11) 91234-5678).",
  })
  whatsappNumber?: string;

  // Vira href numa página PÚBLICA: só https no domínio do Instagram. Antes bastava ser http(s)
  // (o `javascript:` já era barrado), mas qualquer domínio deixava o dono publicar um link de
  // phishing como se fosse o Instagram do salão.
  @IsOptional()
  @ValidateIf((o) => !!o.instagramUrl)
  @Matches(/^https:\/\/(www\.)?instagram\.com\/[A-Za-z0-9._-]+\/?(\?[A-Za-z0-9._=&%-]*)?$/, {
    message: "Instagram inválido. Use o link do perfil (ex: https://instagram.com/seusalao).",
  })
  @MaxLength(300)
  @Trim()
  instagramUrl?: string;

  @IsOptional()
  @IsBoolean()
  showServices?: boolean;

  @IsOptional()
  @IsBoolean()
  showTeam?: boolean;

  @IsOptional()
  @IsBoolean()
  showGallery?: boolean;

  @IsOptional()
  @IsBoolean()
  showContact?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyStaffByEmail?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  minSchedulingLeadTimeMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxSchedulingLeadTimeDays?: number;
}
