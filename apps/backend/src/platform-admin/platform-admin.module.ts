import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { EmailModule } from "../email/email.module";
import { InternalModule } from "../internal/internal.module";
import { PlatformAdminController } from "./platform-admin.controller";
import { PlatformAdminGuard } from "./platform-admin.guard";
import { PlatformAdminService } from "./platform-admin.service";
import { PlatformAuthService } from "./platform-auth.service";
import { PlatformCouponsService } from "./platform-coupons.service";
import { TenantDeletionService } from "./tenant-deletion.service";
import { TrialsService } from "./trials.service";

// Terceira identidade (além de staff e cliente final): a conta da plataforma, definida no .env.
// Reaproveita o JwtService do AuthModule só como "motor" — a chave de assinatura é derivada e própria.
@Module({
  imports: [AuthModule, InternalModule, EmailModule],
  controllers: [PlatformAdminController],
  providers: [PlatformAdminService, PlatformAuthService, PlatformCouponsService, TenantDeletionService, TrialsService, PlatformAdminGuard],
})
export class PlatformAdminModule {}
