import { Module } from "@nestjs/common";
import { CouponsModule } from "../coupons/coupons.module";
import { PlanLimitService } from "./plan-limit.service";
import { BillingController } from "./billing.controller";
import { BillingService } from "./billing.service";
import { PlanCatalogService } from "./plan-catalog.service";
import { AsaasClient } from "./payments/asaas.client";
import { PaymentsService } from "./payments/payments.service";
import { BillingProfileService } from "./payments/billing-profile.service";
import { FieldCryptoService } from "../common/crypto/field-crypto.service";
import { PaymentsController } from "./payments/payments.controller";
import { AsaasWebhookController } from "./payments/asaas-webhook.controller";

// Cobrança pelo Asaas: cartão recorrente (checkout hospedado) e Pix mensal. O acesso nunca depende do que o navegador diz: o
// estado vem da releitura do provedor (webhook, sincronização ao voltar do checkout e tarefa horária).
@Module({
  imports: [CouponsModule],
  controllers: [BillingController, PaymentsController, AsaasWebhookController],
  providers: [PlanLimitService, BillingService, PlanCatalogService, AsaasClient, PaymentsService, BillingProfileService, FieldCryptoService],
  exports: [PlanLimitService, AsaasClient],
})
export class BillingModule {}
