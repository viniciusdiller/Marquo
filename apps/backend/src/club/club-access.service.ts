import { ForbiddenException, Injectable } from "@nestjs/common";
import { Prisma } from "@marquo/database";
import { planIncludesClub, type ClubOverview } from "@marquo/shared-types";
import { PrismaService } from "../prisma/prisma.service";

type Db = PrismaService | Prisma.TransactionClient;

export const CLUB_PLAN_REQUIRED_MESSAGE = "O clube de assinaturas está disponível nos planos Profissional e Premium.";
export const CLUB_DISABLED_MESSAGE = "O clube de assinaturas está desligado. Ative-o para continuar.";

// O clube só funciona se DUAS coisas forem verdade: o plano do negócio inclui o clube (decidido pelo servidor, no catálogo
// único) E o dono ligou o clube. Sem assinatura (período de teste) vale o plano de entrada, que não tem clube.
@Injectable()
export class ClubAccessService {
  constructor(private readonly prisma: PrismaService) {}

  // O plano que vale hoje: o da assinatura, ou nenhum (null) no período de teste, que usa o plano de entrada (sem clube).
  private async currentPlan(tenantId: string, db: Db): Promise<{ tier: string; name: string } | null> {
    const subscription = await db.subscription.findUnique({
      where: { tenantId },
      select: { plan: { select: { tier: true, name: true } } },
    });
    return subscription?.plan ?? null;
  }

  async planAllowsClub(tenantId: string, db: Db = this.prisma): Promise<boolean> {
    return planIncludesClub((await this.currentPlan(tenantId, db))?.tier);
  }

  async overview(tenantId: string, db: Db = this.prisma): Promise<ClubOverview> {
    const [tenant, plan] = await Promise.all([
      db.tenant.findUnique({ where: { id: tenantId }, select: { clubEnabled: true } }),
      this.currentPlan(tenantId, db),
    ]);
    // `enabled` é o que o dono escolheu; quem decide se vale é planAllowsClub (um downgrade desliga sem apagar nada).
    return {
      onTrial: plan === null,
      planName: plan?.name ?? null,
      planAllowsClub: planIncludesClub(plan?.tier),
      enabled: !!tenant?.clubEnabled,
    };
  }

  async isActive(tenantId: string, db: Db = this.prisma): Promise<boolean> {
    const { planAllowsClub, enabled } = await this.overview(tenantId, db);
    return planAllowsClub && enabled;
  }

  async assertActive(tenantId: string, db: Db = this.prisma): Promise<void> {
    const { planAllowsClub, enabled } = await this.overview(tenantId, db);
    if (!planAllowsClub) throw new ForbiddenException(CLUB_PLAN_REQUIRED_MESSAGE);
    if (!enabled) throw new ForbiddenException(CLUB_DISABLED_MESSAGE);
  }
}
