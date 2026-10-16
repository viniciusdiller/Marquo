import { plainToInstance } from "class-transformer";
import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Min,
  MinLength,
  ValidateIf,
  validateSync,
} from "class-validator";

class EnvironmentVariables {
  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  // Assina TODOS os tokens (staff, refresh, cliente): segredo curto é força-bruta offline
  // trivial. 32+ caracteres (ex.: `openssl rand -hex 32`); fail closed no boot.
  @IsString()
  @MinLength(32)
  JWT_SECRET!: string;

  @IsOptional()
  @IsString()
  JWT_EXPIRES_IN?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  PORT?: number;

  // URL pública do frontend: base do link de "definir senha" enviado ao dono (e retorno de pagamento, quando houver). Sem ela em produção o
  // padrão seria localhost, então é obrigatória com NODE_ENV=production.
  @ValidateIf((o) => o.NODE_ENV === "production" || o.FRONTEND_URL !== undefined)
  @IsUrl({ require_tld: false, require_protocol: true, protocols: ["http", "https"] })
  FRONTEND_URL?: string;

  // Origem do site institucional (TotalSoftware), que busca GET /plans para exibir os mesmos preços do app.
  // Opcional: sem ela o site usa a cópia estática dos preços. Entra na lista de CORS (main.ts).
  @IsOptional()
  @IsUrl({ require_tld: false, require_protocol: true, protocols: ["http", "https"] })
  SITE_URL?: string;

  // Nº de proxies confiáveis à frente do backend (ver main.ts). Ausente = não confia em nenhum.
  @IsOptional()
  @IsInt()
  @Min(1)
  TRUST_PROXY_HOPS?: number;

  @IsOptional()
  @IsString()
  NODE_ENV?: string;

  // Segredo compartilhado com o frontend que assina o IP do visitante repassado nas chamadas
  // server-side (ver ClientIpThrottlerGuard). Opcional em desenvolvimento (sem ele o throttle
  // usa o IP da conexão); OBRIGATÓRIO em produção, senão o login fica com um balde único.
  @ValidateIf((o) => o.NODE_ENV === "production" || o.CLIENT_IP_SECRET !== undefined)
  @IsString()
  @MinLength(32)
  CLIENT_IP_SECRET?: string;

  // Segredo compartilhado com o Admin-TotalSoftware para assinar as chamadas da API interna de suporte
  // (/internal/*, ver InternalAuthGuard). Opcional em dev (sem ele a API interna responde 403 a tudo);
  // OBRIGATÓRIO em produção. 32+ caracteres.
  @ValidateIf((o) => o.NODE_ENV === "production" || o.INTERNAL_API_SECRET !== undefined)
  @IsString()
  @MinLength(32)
  INTERNAL_API_SECRET?: string;

  // Mercado Pago (cartão recorrente e Pix). Opcional em desenvolvimento: sem o token as rotas de cobrança respondem
  // 503 e a tela só informa. Com o token em PRODUÇÃO o boot exige também o segredo do webhook e a URL pública do
  // backend (onde o provedor entrega as notificações). O prefixo é conferido para pegar chave trocada.
  @ValidateIf((o) => o.MERCADOPAGO_ACCESS_TOKEN !== undefined)
  @Matches(/^(APP_USR|TEST)-[A-Za-z0-9_-]{10,}$/, {
    message: "MERCADOPAGO_ACCESS_TOKEN deve ser o Access Token do Mercado Pago (APP_USR-... ou TEST-...).",
  })
  MERCADOPAGO_ACCESS_TOKEN?: string;

  @ValidateIf(
    (o) =>
      (o.NODE_ENV === "production" && o.MERCADOPAGO_ACCESS_TOKEN !== undefined) ||
      o.MERCADOPAGO_WEBHOOK_SECRET !== undefined,
  )
  @IsString()
  @MinLength(16)
  MERCADOPAGO_WEBHOOK_SECRET?: string;

  // URL pública do backend (sem barra no fim). Vira o notification_url enviado ao provedor.
  @ValidateIf(
    (o) =>
      (o.NODE_ENV === "production" && o.MERCADOPAGO_ACCESS_TOKEN !== undefined) || o.BACKEND_PUBLIC_URL !== undefined,
  )
  @IsUrl({ require_tld: false, require_protocol: true, protocols: ["http", "https"] })
  BACKEND_PUBLIC_URL?: string;

  // Só para testes com um servidor falso do provedor; ignorado em produção (o cliente usa sempre o host oficial).
  @ValidateIf((o) => o.MERCADOPAGO_API_BASE !== undefined)
  @IsUrl({ require_tld: false, require_protocol: true, protocols: ["http", "https"] })
  MERCADOPAGO_API_BASE?: string;

  // Conta da plataforma (painel de gestão da empresa). As DUAS são opcionais, mas vêm juntas: sem elas o
  // painel fica desligado (login responde 401). A senha NUNCA vai em claro — só o hash bcrypt, gerado por
  // `pnpm --filter backend platform:hash`. Entre aspas simples no .env, porque o hash contém `$`.
  @ValidateIf((o) => o.PLATFORM_ADMIN_EMAIL !== undefined || o.PLATFORM_ADMIN_PASSWORD_HASH !== undefined)
  @IsEmail()
  PLATFORM_ADMIN_EMAIL?: string;

  @ValidateIf((o) => o.PLATFORM_ADMIN_EMAIL !== undefined || o.PLATFORM_ADMIN_PASSWORD_HASH !== undefined)
  @Matches(/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/, {
    message: "PLATFORM_ADMIN_PASSWORD_HASH deve ser um hash bcrypt (gere com `pnpm --filter backend platform:hash`).",
  })
  PLATFORM_ADMIN_PASSWORD_HASH?: string;
}

export function validateEnv(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });

  if (errors.length > 0) {
    throw new Error(`Config inválida: ${errors.toString()}`);
  }

  return validated;
}
