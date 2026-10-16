import { Controller, Get } from "@nestjs/common";
import { BillingService } from "./billing.service";
import { Public } from "../common/decorators/public.decorator";
import { SkipBillingCheck } from "../common/decorators/skip-billing-check.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../auth/types/auth-user";

@Controller()
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Public()
  @Get("plans")
  listPlans() {
    return this.billingService.listPlans();
  }

  // Qualquer papel de staff, mesmo com o acesso bloqueado: é por aqui que o dashboard descobre que
  // está bloqueado e mostra o motivo.
  @SkipBillingCheck()
  @Get("billing/status")
  getStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.billingService.getTenantBillingStatus(user.tenantId);
  }
}
