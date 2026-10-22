import { Controller, Get, StreamableFile } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Role } from "@marquo/database";
import { DataExportService } from "./data-export.service";
import { Roles } from "../common/decorators/roles.decorator";
import { SkipBillingCheck } from "../common/decorators/skip-billing-check.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../auth/types/auth-user";

@Controller("export")
export class DataExportController {
  constructor(private readonly dataExport: DataExportService) {}

  // Só o DONO. Funciona com a conta bloqueada por cobrança (@SkipBillingCheck): quem cancelou ou não pagou ainda
  // tem direito de levar os próprios dados. O tenantId vem do JWT, nunca do request.
  @Roles(Role.OWNER)
  @SkipBillingCheck()
  @Throttle({ default: { limit: 3, ttl: 10 * 60_000 } })
  @Get("data")
  async download(@CurrentUser() user: AuthenticatedUser) {
    const { filename, stream } = await this.dataExport.start(user.tenantId);
    return new StreamableFile(stream, {
      type: "application/json; charset=utf-8",
      disposition: `attachment; filename="${filename}"`,
    });
  }
}
