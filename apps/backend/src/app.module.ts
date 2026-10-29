import { SharedStateModule } from "./shared-state/shared-state.module";
import { SharedStateService } from "./shared-state/shared-state.service";
import { RedisThrottlerStorage } from "./shared-state/redis-throttler.storage";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerModule } from "@nestjs/throttler";
import { ClientIpThrottlerGuard } from "./common/guards/client-ip-throttler.guard";
import { ServeStaticModule } from "@nestjs/serve-static";
import { ScheduleModule } from "@nestjs/schedule";
import { validateEnv } from "./config/env.validation";
import { PrismaModule } from "./prisma/prisma.module";
import { JwtAuthGuard } from "./common/guards/jwt-auth.guard";
import { RolesGuard } from "./common/guards/roles.guard";
import { TenantBillingGuard } from "./common/guards/tenant-billing.guard";
import { UPLOADS_DIR, UPLOADS_URL_PREFIX } from "./common/constants/uploads";
import { AuthModule } from "./auth/auth.module";
import { TenantsModule } from "./tenants/tenants.module";
import { ProfessionalsModule } from "./professionals/professionals.module";
import { ServicesModule } from "./services/services.module";
import { AvailabilityModule } from "./availability/availability.module";
import { TimeBlocksModule } from "./time-blocks/time-blocks.module";
import { AppointmentsModule } from "./appointments/appointments.module";
import { WaitlistModule } from "./waitlist/waitlist.module";
import { BillingModule } from "./billing/billing.module";
import { ClientsModule } from "./clients/clients.module";
import { IntakeModule } from "./intake/intake.module";
import { ProductsModule } from "./products/products.module";
import { TicketsModule } from "./tickets/tickets.module";
import { CommissionsModule } from "./commissions/commissions.module";
import { CashRegisterModule } from "./cash-register/cash-register.module";
import { FinanceModule } from "./finance/finance.module";
import { ConsumerAuthModule } from "./consumer-auth/consumer-auth.module";
import { MarketplaceModule } from "./marketplace/marketplace.module";
import { ReviewsModule } from "./reviews/reviews.module";
import { SignupModule } from "./signup/signup.module";
import { InternalModule } from "./internal/internal.module";
import { PlatformAdminModule } from "./platform-admin/platform-admin.module";
import { DataExportModule } from "./data-export/data-export.module";
import { ReportsModule } from './reports/reports.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ScheduleModule.forRoot(),
    SharedStateModule,
    ThrottlerModule.forRootAsync({
      imports: [SharedStateModule],
      inject: [SharedStateService],
      useFactory: (state: SharedStateService) => ({
        throttlers: [{ ttl: 60_000, limit: 100 }],
        storage: new RedisThrottlerStorage(state),
      }),
    }),
    ServeStaticModule.forRoot({ rootPath: UPLOADS_DIR, serveRoot: UPLOADS_URL_PREFIX }),
    PrismaModule,
    AuthModule,
    TenantsModule,
    ProfessionalsModule,
    ServicesModule,
    AvailabilityModule,
    TimeBlocksModule,
    AppointmentsModule,
    WaitlistModule,
    BillingModule,
    ClientsModule,
    IntakeModule,
    ProductsModule,
    TicketsModule,
    CommissionsModule,
    CashRegisterModule,
    FinanceModule,
    ConsumerAuthModule,
    MarketplaceModule,
    ReviewsModule,
    SignupModule,
    InternalModule,
    PlatformAdminModule,
    DataExportModule,
    ReportsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ClientIpThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: TenantBillingGuard },
  ],
})
export class AppModule {}
