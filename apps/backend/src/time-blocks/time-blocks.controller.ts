import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { Role } from "@marquo/database";
import { TimeBlocksService } from "./time-blocks.service";
import { CreateTimeBlockDto } from "./dto/create-time-block.dto";
import { TimeBlocksQueryDto } from "../common/dto/query-dtos";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../auth/types/auth-user";

@Controller("time-blocks")
export class TimeBlocksController {
  constructor(private readonly timeBlocksService: TimeBlocksService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTimeBlockDto) {
    this.assertOwnsOrIsOwner(user, dto.professionalId);
    return this.timeBlocksService.create(user.tenantId, dto);
  }

  @Get()
  findByProfessional(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: TimeBlocksQueryDto,
  ) {
    this.assertOwnsOrIsOwner(user, query.professionalId);
    return this.timeBlocksService.findByProfessional(user.tenantId, query.professionalId);
  }

  @Delete(":id")
  async remove(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    const block = await this.timeBlocksService.findOneOrThrow(user.tenantId, id);
    this.assertOwnsOrIsOwner(user, block.professionalId);
    await this.timeBlocksService.remove(user.tenantId, id);
    return { success: true };
  }

  private assertOwnsOrIsOwner(user: AuthenticatedUser, professionalId: string) {
    if (user.role === Role.PROFESSIONAL && user.professionalId !== professionalId) {
      throw new ForbiddenException("Você só pode gerenciar bloqueios da própria agenda.");
    }
  }
}
