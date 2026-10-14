import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Role } from "@marquo/database";
import { ReviewsService } from "./reviews.service";
import { CreateReviewDto, ReportReviewDto } from "./dto/review-dtos";
import { Public } from "../common/decorators/public.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../auth/types/auth-user";
import { ConsumerJwtAuthGuard } from "../consumer-auth/guards/consumer-jwt-auth.guard";
import { CurrentConsumer } from "../consumer-auth/decorators/current-consumer.decorator";
import { AuthenticatedConsumer } from "../consumer-auth/types/consumer-auth-user";

// Consumidor global (login próprio) — protegido pelo ConsumerJwtAuthGuard local.
@Controller("public/consumer/reviews")
export class ConsumerReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Public()
  @UseGuards(ConsumerJwtAuthGuard)
  @Get("pending")
  pending(@CurrentConsumer() consumer: AuthenticatedConsumer) {
    return this.reviews.reviewableAppointments(consumer);
  }

  // Consistência com toda outra rota pública de escrita do projeto (mesmo já sendo
  // naturalmente limitada pelo número de atendimentos concluídos do consumidor).
  @Public()
  @UseGuards(ConsumerJwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post()
  create(@CurrentConsumer() consumer: AuthenticatedConsumer, @Body() dto: CreateReviewDto) {
    return this.reviews.create(consumer, dto);
  }
}

// Painel do dono — moderação das avaliações do próprio estabelecimento.
@Roles(Role.OWNER)
@Controller("reviews")
export class OwnerReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.reviews.listForOwner(user);
  }

  @Patch(":id/hide")
  hide(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.reviews.hide(user, id);
  }

  @Patch(":id/report")
  report(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: ReportReviewDto,
  ) {
    return this.reviews.report(user, id, dto);
  }
}
