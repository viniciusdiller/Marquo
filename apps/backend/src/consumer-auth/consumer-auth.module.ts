import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { EmailModule } from "../email/email.module";
import { ConsumerAuthController } from "./consumer-auth.controller";
import { ConsumerAuthService } from "./consumer-auth.service";
import { ConsumerEmailCodeService } from "./consumer-email-code.service";
import { ConsumerJwtAuthGuard } from "./guards/consumer-jwt-auth.guard";

@Module({
  imports: [AuthModule, EmailModule],
  controllers: [ConsumerAuthController],
  providers: [ConsumerAuthService, ConsumerEmailCodeService, ConsumerJwtAuthGuard],
  // Reexporta AuthModule pra o JwtService ficar visível onde o guard é usado via
  // @UseGuards em outro módulo — ex.: AppointmentsModule, WaitlistModule, ReviewsModule.
  exports: [AuthModule, ConsumerAuthService, ConsumerJwtAuthGuard],
})
export class ConsumerAuthModule {}
