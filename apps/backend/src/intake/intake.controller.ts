import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { Role } from "@marquo/database";
import { IntakeService } from "./intake.service";
import { UpsertIntakeFormDto } from "./dto/upsert-intake-form.dto";
import { SubmitIntakeResponseDto } from "./dto/submit-intake-response.dto";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../auth/types/auth-user";

@Controller("intake/forms")
export class IntakeFormsController {
  constructor(private readonly intake: IntakeService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.intake.listForms(user.tenantId);
  }

  @Roles(Role.OWNER)
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpsertIntakeFormDto) {
    return this.intake.createForm(user.tenantId, dto);
  }

  @Roles(Role.OWNER)
  @Patch(":id")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpsertIntakeFormDto,
  ) {
    return this.intake.updateForm(user.tenantId, id, dto);
  }
}

@Roles(Role.OWNER, Role.RECEPTIONIST, Role.PROFESSIONAL)
@Controller("intake/responses")
export class IntakeResponsesController {
  constructor(private readonly intake: IntakeService) {}

  @Post()
  submit(@CurrentUser() user: AuthenticatedUser, @Body() dto: SubmitIntakeResponseDto) {
    return this.intake.submitResponse(user.tenantId, dto, user);
  }
}
