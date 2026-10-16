import { Module } from "@nestjs/common";
import { InternalController } from "./internal.controller";
import { InternalService } from "./internal.service";
import { InternalAuthGuard } from "./internal-auth.guard";

@Module({
  controllers: [InternalController],
  providers: [InternalService, InternalAuthGuard],
  // PlatformAdminModule reaproveita a geração do link de redefinição (mesma transação com auditoria).
  exports: [InternalService],
})
export class InternalModule {}
