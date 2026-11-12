import { Body, Controller, Headers, HttpCode, Logger, Post, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SkipThrottle } from "@nestjs/throttler";
import { createHash, timingSafeEqual } from "crypto";
import { Public } from "../../common/decorators/public.decorator";
import { PaymentsService } from "./payments.service";

interface NotificationBody {
  event?: unknown;
  payment?: { id?: unknown };
  subscription?: { id?: unknown };
  checkout?: { id?: unknown };
}

// Comparação em tempo constante sem vazar o tamanho: compara os hashes.
function tokensMatch(received: string | undefined, expected: string): boolean {
  if (!received) return false;
  const a = createHash("sha256").update(received).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

// POST /webhooks/asaas — público, mas o corpo é só um AVISO: o estado real é sempre relido na API do Asaas com a nossa
// chave (ver PaymentsService.handleNotification). Por isso uma notificação forjada, repetida ou fora de ordem não
// consegue creditar nada. O Asaas não assina o corpo: ele repete o `authToken` que cadastramos no cabeçalho
// `asaas-access-token`, e com ASAAS_WEBHOOK_TOKEN configurado qualquer outro valor é recusado (401). Responde 200 mesmo
// para eventos que não tratamos: o Asaas pausa a fila do webhook depois de várias respostas que não sejam 2xx.
@Controller("webhooks")
export class AsaasWebhookController {
  private readonly logger = new Logger(AsaasWebhookController.name);

  constructor(
    private readonly payments: PaymentsService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @SkipThrottle()
  @HttpCode(200)
  @Post("asaas")
  async receive(@Body() body: NotificationBody, @Headers("asaas-access-token") token: string | undefined) {
    const secret = this.config.get<string>("ASAAS_WEBHOOK_TOKEN");
    if (secret && !tokensMatch(token, secret)) {
      this.logger.warn("Notificação do Asaas com token inválido recusada.");
      throw new UnauthorizedException();
    }

    const event = typeof body?.event === "string" ? body.event : "";
    const target = this.targetOf(event, body);
    if (!target) return { received: true };

    await this.payments.handleNotification(target.kind, target.id);
    return { received: true };
  }

  // Qual objeto do aviso identifica o que mudou, pelo prefixo do evento.
  private targetOf(event: string, body: NotificationBody): { kind: string; id: string } | null {
    const pick = (kind: string, value: unknown) => {
      const id = typeof value === "string" ? value.trim() : "";
      return id && id.length <= 64 ? { kind, id } : null;
    };
    if (event.startsWith("PAYMENT_")) return pick("payment", body?.payment?.id);
    if (event.startsWith("SUBSCRIPTION_")) return pick("subscription", body?.subscription?.id);
    if (event.startsWith("CHECKOUT_")) return pick("checkout", body?.checkout?.id);
    return null;
  }
}
