import { Body, Controller, Get, Post } from "@nestjs/common";
import { Role } from "@marquo/database";
import { CashRegisterService } from "./cash-register.service";
import { OpenCashRegisterDto } from "./dto/open-cash-register.dto";
import { CashMovementDto, CloseCashRegisterDto } from "./dto/cash-movement.dto";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../auth/types/auth-user";

@Roles(Role.OWNER, Role.RECEPTIONIST)
@Controller("cash-register")
export class CashRegisterController {
  constructor(private readonly cashRegister: CashRegisterService) {}

  @Get()
  summary(@CurrentUser() user: AuthenticatedUser) {
    return this.cashRegister.summary(user.tenantId);
  }

  @Post("open")
  open(@CurrentUser() user: AuthenticatedUser, @Body() dto: OpenCashRegisterDto) {
    return this.cashRegister.open(user.tenantId, user.userId, dto);
  }

  @Post("movements")
  addMovement(@CurrentUser() user: AuthenticatedUser, @Body() dto: CashMovementDto) {
    return this.cashRegister.addMovement(user.tenantId, dto);
  }

  @Post("close")
  close(@CurrentUser() user: AuthenticatedUser, @Body() dto: CloseCashRegisterDto) {
    return this.cashRegister.close(user.tenantId, dto);
  }
}
