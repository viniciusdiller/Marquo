import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Role } from "@marquo/database";
import { FinanceService } from "./finance.service";
import {
  CreateCategoryDto,
  CreateEntryDto,
  RegisterPayoutDto,
  SettleEntryDto,
  UpdateCategoryDto,
  UpdateEntryDto,
} from "./dto/finance-dtos";
import { PayoutsQueryDto } from "./dto/payouts-query.dto";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { CashFlowQueryDto, ListEntriesQueryDto, RequiredDateRangeQueryDto } from "../common/dto/query-dtos";
import { AuthenticatedUser } from "../auth/types/auth-user";

// PROFESSIONAL não acessa o financeiro; RECEPTIONIST lança e dá baixa; OWNER tudo.
@Roles(Role.OWNER, Role.RECEPTIONIST)
@Controller("finance")
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  @Get("overview")
  overview(@CurrentUser() user: AuthenticatedUser) {
    return this.finance.overview(user.tenantId);
  }

  @Get("categories")
  listCategories(@CurrentUser() user: AuthenticatedUser) {
    return this.finance.listCategories(user.tenantId);
  }

  @Roles(Role.OWNER)
  @Post("categories")
  createCategory(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCategoryDto) {
    return this.finance.createCategory(user.tenantId, dto);
  }

  @Roles(Role.OWNER)
  @Patch("categories/:id")
  updateCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.finance.updateCategory(user.tenantId, id, dto);
  }

  @Get("entries")
  listEntries(@CurrentUser() user: AuthenticatedUser, @Query() query: ListEntriesQueryDto) {
    return this.finance.listEntries(user.tenantId, query);
  }

  @Post("entries")
  createEntry(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateEntryDto) {
    return this.finance.createEntry(user.tenantId, user.userId, dto);
  }

  @Patch("entries/:id")
  updateEntry(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpdateEntryDto,
  ) {
    return this.finance.updateEntry(user.tenantId, id, dto);
  }

  @Post("entries/:id/settle")
  settleEntry(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: SettleEntryDto,
  ) {
    return this.finance.settleEntry(user.tenantId, id, dto);
  }

  @Post("entries/:id/cancel")
  cancelEntry(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.finance.cancelEntry(user.tenantId, id);
  }

  // Dinheiro saindo: teto de requisições por minuto, além do limite global de 100/min.
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Roles(Role.OWNER)
  @Post("commissions/payouts")
  registerPayout(@CurrentUser() user: AuthenticatedUser, @Body() dto: RegisterPayoutDto) {
    return this.finance.registerCommissionPayout(user.tenantId, user.userId, dto);
  }

  @Roles(Role.OWNER)
  @Get("commissions/payouts")
  listPayouts(@CurrentUser() user: AuthenticatedUser, @Query() query: PayoutsQueryDto) {
    return this.finance.listCommissionPayouts(user.tenantId, query);
  }

  @Get("cash-flow")
  cashFlow(@CurrentUser() user: AuthenticatedUser, @Query() query: CashFlowQueryDto) {
    return this.finance.cashFlow(user.tenantId, query.from, query.to, query.basis === "due" ? "due" : "paid");
  }

  @Roles(Role.OWNER)
  @Get("dre")
  dre(@CurrentUser() user: AuthenticatedUser, @Query() query: RequiredDateRangeQueryDto) {
    return this.finance.dre(user.tenantId, query.from, query.to);
  }

  @Get("payables")
  payables(@CurrentUser() user: AuthenticatedUser) {
    return this.finance.openItems(user.tenantId, "EXPENSE");
  }

  @Get("receivables")
  receivables(@CurrentUser() user: AuthenticatedUser) {
    return this.finance.openItems(user.tenantId, "INCOME");
  }
}
