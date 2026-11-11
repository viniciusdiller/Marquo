import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { IntakeService } from "./intake.service";
import { UpsertIntakeFormDto } from "./dto/upsert-intake-form.dto";
import { SubmitIntakeResponseDto } from "./dto/submit-intake-response.dto";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../auth/types/auth-user";

import { Area } from "../access/area.decorator";
@Controller("intake/forms")
export class IntakeFormsController {
  constructor(private readonly intake: IntakeService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.intake.listForms(user.tenantId);
  }

  @Area("fichas", "EDIT")
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpsertIntakeFormDto) {
    return this.intake.createForm(user.tenantId, dto);
  }

  @Area("fichas", "EDIT")
  @Patch(":id")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpsertIntakeFormDto,
  ) {
    return this.intake.updateForm(user.tenantId, id, dto);
  }
}

// Preencher a ficha de um cliente no atendimento pede só "ver" a área Fichas; criar e editar os MODELOS pede "editar".
@Area("fichas", "VIEW")
@Controller("intake/responses")
export class IntakeResponsesController {
  constructor(private readonly intake: IntakeService) {}

  @Post()
  submit(@CurrentUser() user: AuthenticatedUser, @Body() dto: SubmitIntakeResponseDto) {
    return this.intake.submitResponse(user.tenantId, dto, user);
  }
}
