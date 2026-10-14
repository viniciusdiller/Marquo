import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PlanTier } from "@marquo/database";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class PlanLimitService {
  constructor(private readonly prisma: PrismaService) {}

  private async getActivePlan(tenantId: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { tenantId },
      include: { plan: true },
    });

    if (subscription) {
      return subscription.plan;
    }

    // Sem assinatura ainda (trial): usa os limites do plano de entrada (Essencial) como teto do trial.
    const essencial = await this.prisma.plan.findUnique({ where: { tier: PlanTier.ESSENCIAL } });
    if (!essencial) {
      throw new NotFoundException("Plano Essencial não está cadastrado (rode o seed de planos).");
    }
    return essencial;
  }

  private async countActiveProfessionals(tenantId: string): Promise<number> {
    return this.prisma.professional.count({ where: { tenantId, isActive: true } });
  }

  async assertCanAddProfessional(tenantId: string): Promise<void> {
    const plan = await this.getActivePlan(tenantId);
    if (plan.maxProfessionals === null) {
      return;
    }

    const activeCount = await this.countActiveProfessionals(tenantId);
    if (activeCount >= plan.maxProfessionals) {
      throw new ConflictException(
        `Limite de profissionais do plano ${plan.name} atingido (${plan.maxProfessionals}). Faça upgrade para adicionar mais.`,
      );
    }
  }

  async assertCanDowngrade(tenantId: string, newTier: PlanTier): Promise<void> {
    const newPlan = await this.prisma.plan.findUnique({ where: { tier: newTier } });
    if (!newPlan) {
      throw new NotFoundException("Plano de destino não encontrado.");
    }
    if (newPlan.maxProfessionals === null) {
      return;
    }

    const activeCount = await this.countActiveProfessionals(tenantId);
    if (activeCount > newPlan.maxProfessionals) {
      throw new ConflictException(
        `Você tem ${activeCount} profissionais ativos, mas o plano ${newPlan.name} permite no máximo ${newPlan.maxProfessionals}. Desative profissionais antes de fazer o downgrade.`,
      );
    }
  }
}
