import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { PlanTier } from "@marquo/database";
import { PLAN_CATALOG } from "@marquo/shared-types";
import { PrismaService } from "../prisma/prisma.service";

// A tabela `Plan` é ESPELHO do catálogo (packages/shared-types/src/index.ts): a cada boot ela é regravada a partir
// dele. Mudar preço ou limite = editar o catálogo + deploy; nada de UPDATE manual nem migration (a migration
// `seed_plans` guarda valores antigos de propósito, e este sync os corrige no primeiro boot).
@Injectable()
export class PlanCatalogService implements OnModuleInit {
  private readonly logger = new Logger(PlanCatalogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.syncPlans();
  }

  async syncPlans(): Promise<void> {
    for (const entry of PLAN_CATALOG) {
      const tier = entry.tier as PlanTier;
      const values = {
        name: entry.name,
        priceCents: entry.priceCents,
        maxProfessionals: entry.maxProfessionals,
      };
      await this.prisma.plan.upsert({ where: { tier }, update: values, create: { tier, ...values } });
    }
    this.logger.log(`Planos sincronizados com o catálogo (${PLAN_CATALOG.length}).`);
  }
}
