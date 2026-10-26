import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { PassportModule } from "@nestjs/passport";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { JwtStrategy } from "./strategies/jwt.strategy";
import { RefreshTokenService } from "./refresh-token.service";
import { PasswordResetService } from "./password-reset.service";
import { EmailVerificationService } from "./email-verification.service";
import { EmailModule } from "../email/email.module";

@Module({
  imports: [
    EmailModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>("JWT_SECRET"),
        signOptions: { expiresIn: configService.get<string>("JWT_EXPIRES_IN") ?? "12h" },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, RefreshTokenService, PasswordResetService, EmailVerificationService, JwtStrategy],
  // JwtModule exportado para o consumer-auth reaproveitar o mesmo JwtService (mesmo
  // JWT_SECRET) sem reconfigurar — ver consumer-auth/consumer-auth.module.ts.
  exports: [AuthService, EmailVerificationService, JwtModule],
})
export class AuthModule {}
