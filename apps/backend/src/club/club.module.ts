import { Module } from "@nestjs/common";
import { FinanceModule } from "../finance/finance.module";
import { ClubController } from "./club.controller";
import { ClubService } from "./club.service";
import { ClubAccessService } from "./club-access.service";

@Module({
  imports: [FinanceModule],
  controllers: [ClubController],
  providers: [ClubService, ClubAccessService],
  exports: [ClubService, ClubAccessService],
})
export class ClubModule {}
