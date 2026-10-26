import { Module } from "@nestjs/common";
import { CouponsModule } from "../coupons/coupons.module";
import { PlanLimitService } from "./plan-limit.service";
import { BillingController } from "./billing.controller";
import { BillingService } from "./billing.service";
import { PlanCatalogService } from "./plan-catalog.service";
import { MercadoPagoClient } from "./payments/mercadopago.client";
import { PaymentsService } from "./payments/payments.service";
import { PaymentsController } from "./payments/payments.controller";
import { MercadoPagoWebhookController } from "./payments/mercadopago-webhook.controller";

// Cobrança pelo Mercado Pago: cartão recorrente e Pix mensal. O acesso nunca depende do que o navegador diz: o
// estado vem da releitura do provedor (webhook, sincronização ao voltar do checkout e tarefa horária).
@Module({
  imports: [CouponsModule],
  controllers: [BillingController, PaymentsController, MercadoPagoWebhookController],
  providers: [PlanLimitService, BillingService, PlanCatalogService, MercadoPagoClient, PaymentsService],
  exports: [PlanLimitService, MercadoPagoClient],
})
export class BillingModule {}
