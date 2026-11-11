import { IsIn, IsOptional } from "class-validator";

// "CLOSED" é a visão "Encerrados" do painel: resolvidos e cancelados juntos. Vem da URL, então só aceita os valores conhecidos (um
// valor solto chegaria cru ao Prisma e viraria 500 em vez de 400).
export const WAITLIST_FILTERS = ["PENDING", "CONTACTED", "RESOLVED", "CANCELED", "CLOSED"] as const;
export type WaitlistFilter = (typeof WAITLIST_FILTERS)[number];

export class FindWaitlistQueryDto {
  @IsOptional()
  @IsIn(WAITLIST_FILTERS as unknown as string[])
  status?: WaitlistFilter;
}
