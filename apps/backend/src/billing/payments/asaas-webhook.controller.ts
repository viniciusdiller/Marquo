import { Body, Controller, Headers, HttpCode, Logger, Post, Query, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SkipThrottle } from "@nestjs/throttler";
import { Public } from "../../common/decorators/public.decorator";
import { PaymentsService } from "./payments.service";
import { verifyMercadoPagoSignature } from "./mercadopago-signature";

interface NotificationBody {
  type?: unknown;
  topic?: unknown;
  action?: unknown;
  data?: { id?: unknown };
}

// POST /webhooks/mercadopago — público, mas o corpo é só um AVISO: o estado real é sempre relido na API do
// Mercado Pago com o nosso token (ver PaymentsService.handleNotification). Por isso uma notificação forjada, repetida
// ou fora de ordem não consegue creditar nada. Se vier x-signature e houver segredo configurado, ela é conferida e
// uma assinatura inválida é recusada; sem o cabeçalho (assinaturas recorrentes podem não trazê-lo) segue pela
// releitura. Responde 200 mesmo para tipos desconhecidos (o provedor reentrega o que não for 2xx).
@Controller("webhooks")
export class MercadoPagoWebhookController {
  private readonly logger = new Logger(MercadoPagoWebhookController.name);

  constructor(
    private readonly payments: PaymentsService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @SkipThrottle()
  @HttpCode(200)
  @Post("mercadopago")
  async receive(
    @Body() body: NotificationBody,
    @Query("data.id") queryDataId: string | undefined,
    @Query("type") queryType: string | undefined,
    @Query("topic") queryTopic: string | undefined,
    @Headers("x-signature") signature: string | undefined,
    @Headers("x-request-id") requestId: string | undefined,
  ) {
    const bodyId = body?.data?.id;
    const dataId = String(queryDataId ?? (typeof bodyId === "string" || typeof bodyId === "number" ? bodyId : "")).trim();
    const rawType = body?.type ?? body?.topic ?? queryType ?? queryTopic;
    const type = typeof rawType === "string" ? rawType : "";

    const secret = this.config.get<string>("MERCADOPAGO_WEBHOOK_SECRET");
    if (secret) {
      const result = verifyMercadoPagoSignature({ signatureHeader: signature, requestId, dataId, secret });
      if (result === "invalid") {
        this.logger.warn("Notificação do Mercado Pago com assinatura inválida recusada.");
        throw new UnauthorizedException();
      }
    }

    if (!type || !dataId || dataId.length > 64) return { received: true };
    await this.payments.handleNotification(type, dataId);
    return { received: true };
  }
}
