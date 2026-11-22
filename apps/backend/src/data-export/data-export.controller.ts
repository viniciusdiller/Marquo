import { Controller, Get, Query, StreamableFile } from "@nestjs/common";
import { IsIn, IsOptional } from "class-validator";
import { Throttle } from "@nestjs/throttler";
import { Role } from "@marquo/database";
import { DataExportService } from "./data-export.service";
import { Roles } from "../common/decorators/roles.decorator";
import { SkipBillingCheck } from "../common/decorators/skip-billing-check.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../auth/types/auth-user";

export class ExportQueryDto {
  // "planilha" = .xlsx (uma aba por assunto); sem o parâmetro, o JSON completo de sempre.
  @IsOptional()
  @IsIn(["json", "planilha"])
  formato?: "json" | "planilha";
}

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

@Controller("export")
export class DataExportController {
  constructor(private readonly dataExport: DataExportService) {}

  // Só o DONO. Funciona com a conta bloqueada por cobrança (@SkipBillingCheck): quem cancelou ou não pagou ainda
  // tem direito de levar os próprios dados. O tenantId vem do JWT, nunca do request.
  @Roles(Role.OWNER)
  @SkipBillingCheck()
  @Throttle({ default: { limit: 3, ttl: 10 * 60_000 } })
  @Get("data")
  async download(@CurrentUser() user: AuthenticatedUser, @Query() query: ExportQueryDto = {}) {
    const xlsx = query.formato === "planilha";
    const { filename, stream } = await this.dataExport.start(user.tenantId, xlsx ? "xlsx" : "json");
    return new StreamableFile(stream, {
      type: xlsx ? XLSX_TYPE : "application/json; charset=utf-8",
      disposition: `attachment; filename="${filename}"`,
    });
  }
}
