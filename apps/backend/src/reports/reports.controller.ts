import { Controller, Get, Query } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { GetGeneralBalanceQueryDto } from './dto/get-general-balance.dto';
import { GetClientBalanceQueryDto } from './dto/get-client-balance.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/auth-user';
import { Area } from "../access/area.decorator";
@Area("relatorios")
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('general')
  getGeneralBalance(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: GetGeneralBalanceQueryDto,
  ) {
    return this.reportsService.getGeneralBalance(
      user.tenantId,
      new Date(query.startDate),
      new Date(query.endDate),
    );
  }

  @Get('client-monthly')
  getClientMonthlyBalance(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: GetClientBalanceQueryDto,
  ) {
    return this.reportsService.getClientMonthlyBalance(
      user.tenantId,
      query.clientId,
      query.year,
      query.month,
    );
  }
}
