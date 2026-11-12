import { plainToInstance } from "class-transformer";
import {
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  validateSync,
} from "class-validator";

class EnvironmentVariables {
  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @IsUrl({ require_tld: false, require_protocol: true, protocols: ["redis", "rediss"] })
  REDIS_URL!: string;

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

  // Asaas (cartão recorrente pelo checkout hospedado e Pix). Opcional em desenvolvimento: sem a chave as rotas de cobrança
  // respondem 503 e a tela só informa. A chave começa com `$aact_prod_` (produção) ou `$aact_hmlg_` (sandbox); o prefixo é
  // conferido para pegar chave trocada ou colada pela metade. No .env, entre aspas simples (o `$` seria expandido).
  @ValidateIf((o) => o.ASAAS_API_KEY !== undefined)
  @Matches(/^\$aact_(prod|hmlg)_\S{20,}$/, {
    message: "ASAAS_API_KEY deve ser a chave de API do Asaas ($aact_prod_... ou $aact_hmlg_...), entre aspas simples no .env.",
  })
  ASAAS_API_KEY?: string;

  // Token do webhook: o mesmo valor cadastrado como "Token de autenticação" no webhook do Asaas, que o devolve no cabeçalho
  // `asaas-access-token` de cada aviso. O Asaas aceita de 32 a 255 caracteres. Com a chave em PRODUÇÃO é obrigatório (sem
  // ele qualquer um poderia disparar leituras na API do provedor).
  @ValidateIf(
    (o) => (o.NODE_ENV === "production" && o.ASAAS_API_KEY !== undefined) || o.ASAAS_WEBHOOK_TOKEN !== undefined,
  )
  @IsString()
  @MinLength(32)
  @MaxLength(255)
  ASAAS_WEBHOOK_TOKEN?: string;

  // Base https do endereço de volta do checkout do cartão (opcional; padrão = FRONTEND_URL). O Asaas recusa URL http/localhost
  // ("O campo successUrl é inválido"), então em desenvolvimento aponte para um túnel https do frontend (porta 3000).
  @ValidateIf((o) => o.ASAAS_BACK_URL_BASE !== undefined)
  @IsUrl({ require_tld: false, require_protocol: true, protocols: ["https"] })
  ASAAS_BACK_URL_BASE?: string;

  // Só para testes com um servidor falso do provedor; ignorado em produção (o cliente usa sempre o host oficial).
  @ValidateIf((o) => o.ASAAS_API_BASE !== undefined)
  @IsUrl({ require_tld: false, require_protocol: true, protocols: ["http", "https"] })
  ASAAS_API_BASE?: string;

  // E-mail transacional (Resend): aviso de novo agendamento, confirmação ao cliente. Opcional: sem a chave o
  // envio fica desligado (nada sai, nada quebra). A chave e o remetente vêm JUNTOS; o remetente precisa ser de
  // um domínio verificado no Resend ("Nome <avisos@dominio.com.br>" ou só o endereço).
  @ValidateIf((o) => o.RESEND_API_KEY !== undefined || o.EMAIL_FROM !== undefined)
  @Matches(/^re_[A-Za-z0-9_-]{10,}$/, {
    message: "RESEND_API_KEY deve ser uma chave de API do Resend (re_...).",
  })
  RESEND_API_KEY?: string;

  @ValidateIf((o) => o.RESEND_API_KEY !== undefined || o.EMAIL_FROM !== undefined)
  @Matches(/^(?:[^<>\r\n@]+<[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+>|[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+)$/, {
    message: 'EMAIL_FROM deve ser "Nome <avisos@dominio.com.br>" ou só o endereço.',
  })
  EMAIL_FROM?: string;

  // Conta da plataforma (painel de gestão da empresa). As DUAS são opcionais, mas vêm juntas: sem elas o
  // painel fica desligado (login responde 401). A senha NUNCA vai em claro — só o hash bcrypt, gerado por
  // `pnpm --filter backend platform:hash`. Entre aspas simples no .env, porque o hash contém `$`.
  @ValidateIf((o) => o.PLATFORM_ADMIN_EMAIL !== undefined || o.PLATFORM_ADMIN_PASSWORD_HASH !== undefined)
  @IsEmail()
  PLATFORM_ADMIN_EMAIL?: string;

  // Segundo fator do login da plataforma. "email" = a senha certa manda um código de 6 dígitos ao PLATFORM_ADMIN_EMAIL,
  // que precisa ser uma caixa que você lê. Opcional (desligado por padrão: ligar sem o e-mail funcionando trancaria você
  // para fora); exige conta da plataforma e e-mail configurados, conferido em validateEnv.
  @IsOptional()
  @IsIn(["email"], { message: 'PLATFORM_ADMIN_2FA só aceita "email".' })
  PLATFORM_ADMIN_2FA?: string;

  @ValidateIf((o) => o.PLATFORM_ADMIN_EMAIL !== undefined || o.PLATFORM_ADMIN_PASSWORD_HASH !== undefined)
  @Matches(/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/, {
    message: "PLATFORM_ADMIN_PASSWORD_HASH deve ser um hash bcrypt (gere com `pnpm --filter backend platform:hash`).",
  })
  PLATFORM_ADMIN_PASSWORD_HASH?: string;
}

// `CHAVE=` (vazio) no arquivo de ambiente vale como "não definida". Assim o `.env.example` lista TODAS as variáveis sem comentário
// (é só preencher o que for usar) e copiá-lo não derruba o boot nem liga, sem querer, uma integração com valor falso.
// Obrigatória vazia continua falhando (some e cai na regra de "faltando"); em produção, idem.
function withoutBlankValues(config: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    if (typeof value === "string" && value.trim() === "") {
      // Sem isto o ConfigService cairia no process.env e devolveria "" (e `?? padrão` não pega string vazia).
      delete process.env[key];
      continue;
    }
    result[key] = value;
  }
  return result;
}

export function validateEnv(rawConfig: Record<string, unknown>) {
  const config = withoutBlankValues(rawConfig);
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });

  if (errors.length > 0) {
    throw new Error(`Config inválida: ${errors.toString()}`);
  }

  // 2FA ligado sem como entregar o código = ninguém mais entra no painel. Falha no boot, não no primeiro login.
  if (validated.PLATFORM_ADMIN_2FA === "email") {
    const missing = [
      ["PLATFORM_ADMIN_EMAIL", validated.PLATFORM_ADMIN_EMAIL],
      ["PLATFORM_ADMIN_PASSWORD_HASH", validated.PLATFORM_ADMIN_PASSWORD_HASH],
      ["RESEND_API_KEY", validated.RESEND_API_KEY],
      ["EMAIL_FROM", validated.EMAIL_FROM],
    ]
      .filter(([, value]) => !value)
      .map(([name]) => name);
    if (missing.length > 0) {
      throw new Error(`Config inválida: PLATFORM_ADMIN_2FA=email exige também ${missing.join(", ")}.`);
    }
  }

  return validated;
}
