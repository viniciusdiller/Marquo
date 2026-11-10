import { Module } from "@nestjs/common";
import { TicketsService } from "./tickets.service";
import { TicketsController } from "./tickets.controller";
import { ProductsModule } from "../products/products.module";
import { CommissionsModule } from "../commissions/commissions.module";
import { CashRegisterModule } from "../cash-register/cash-register.module";
import { FinanceModule } from "../finance/finance.module";
import { ClubModule } from "../club/club.module";

@Module({
  imports: [ProductsModule, CommissionsModule, CashRegisterModule, FinanceModule, ClubModule],
  controllers: [TicketsController],
  providers: [TicketsService],
  exports: [TicketsService],
})
export class TicketsModule {}
