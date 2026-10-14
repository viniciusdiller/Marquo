import { ArrayMaxSize, ArrayUnique, IsArray, IsEnum, IsOptional, IsUUID } from "class-validator";
import { PlanTier } from "@marquo/database";

// O cliente só escolhe QUAL plano. Preço, Price do Stripe, tenant e customer são sempre derivados
// no servidor (env + JWT): nenhum campo de valor existe nestes DTOs.
export class CreateCheckoutDto {
  @IsEnum(PlanTier)
  tier!: PlanTier;
}

export class PreviewChangePlanQueryDto {
  @IsEnum(PlanTier)
  tier!: PlanTier;
}

export class ChangePlanDto {
  @IsEnum(PlanTier)
  tier!: PlanTier;

  // Profissionais que o dono escolheu desativar para caber no plano menor. O servidor exige que
  // sejam exatamente os necessários (nem mais, nem menos) e que sejam do tenant dele.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsUUID("4", { each: true })
  deactivateProfessionalIds?: string[];
}
