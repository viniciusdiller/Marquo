import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Role } from "@marquo/database";
import { AppointmentsService } from "./appointments.service";
import { CreateAppointmentDto } from "./dto/create-appointment.dto";
import { CreateStaffAppointmentDto } from "./dto/create-staff-appointment.dto";
import { ListConsumerBookingsQueryDto } from "./dto/list-consumer-bookings-query.dto";
import { RescheduleAppointmentDto } from "./dto/reschedule-appointment.dto";
import { UpdateAppointmentStatusDto } from "./dto/update-appointment-status.dto";
import { Public } from "../common/decorators/public.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../auth/types/auth-user";
import { DateRangeQueryDto, RangeByProfessionalQueryDto } from "../common/dto/query-dtos";
import { ConsumerJwtAuthGuard } from "../consumer-auth/guards/consumer-jwt-auth.guard";
import { CurrentConsumer } from "../consumer-auth/decorators/current-consumer.decorator";
import { AuthenticatedConsumer } from "../consumer-auth/types/consumer-auth-user";

// Agendamento pelo link público do tenant. Caminho mantido em /bookings por
// compatibilidade com o wizard público do frontend.
@Controller("public/tenants/:slug/bookings")
export class PublicAppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Public()
  @UseGuards(ConsumerJwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post()
  create(
    @Param("slug") slug: string,
    @Body() dto: CreateAppointmentDto,
    @CurrentConsumer() consumer: AuthenticatedConsumer,
  ) {
    return this.appointments.createFromPublicLink(slug, dto, consumer);
  }
}

// Painel do dono/recepção. OWNER e RECEPTIONIST enxergam a agenda inteira;
// PROFESSIONAL só a própria (filtro aplicado no service).
@Controller("appointments")
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: DateRangeQueryDto,
  ) {
    return this.appointments.findForAdmin(user, query.from, query.to);
  }

  @Get("calendar")
  calendar(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: RangeByProfessionalQueryDto,
  ) {
    return this.appointments.getCalendar(user, query.from, query.to, query.professionalId);
  }

  @Roles(Role.OWNER, Role.RECEPTIONIST, Role.PROFESSIONAL)
  @Post()
  createByStaff(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateStaffAppointmentDto) {
    return this.appointments.createByStaff(user, dto);
  }

  @Roles(Role.OWNER, Role.RECEPTIONIST, Role.PROFESSIONAL)
  @Patch(":id/status")
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpdateAppointmentStatusDto,
  ) {
    return this.appointments.updateStatus(user, id, dto);
  }

  @Roles(Role.OWNER, Role.RECEPTIONIST, Role.PROFESSIONAL)
  @Patch(":id/cancel")
  cancel(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.appointments.cancelByStaff(user, id);
  }

  @Roles(Role.OWNER, Role.RECEPTIONIST, Role.PROFESSIONAL)
  @Patch(":id/reschedule")
  reschedule(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: RescheduleAppointmentDto,
  ) {
    return this.appointments.rescheduleByStaff(user, id, dto);
  }
}

// Área do cliente logado (Consumer, todos os salões — ver consumer-auth/). Protegida pelo
// ConsumerJwtAuthGuard local — @Public() pula a cadeia global de guards de staff.
@Controller("public/consumer/bookings")
export class ConsumerAppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Public()
  @UseGuards(ConsumerJwtAuthGuard)
  @Get()
  findMine(
    @CurrentConsumer() consumer: AuthenticatedConsumer,
    @Query() query: ListConsumerBookingsQueryDto,
  ) {
    return this.appointments.findAllForConsumer(consumer, query);
  }

  @Public()
  @UseGuards(ConsumerJwtAuthGuard)
  @Patch(":id/cancel")
  cancelMine(@Param("id") id: string, @CurrentConsumer() consumer: AuthenticatedConsumer) {
    return this.appointments.cancelForConsumer(id, consumer);
  }

  @Public()
  @UseGuards(ConsumerJwtAuthGuard)
  @Patch(":id/reschedule")
  rescheduleMine(
    @Param("id") id: string,
    @Body() dto: RescheduleAppointmentDto,
    @CurrentConsumer() consumer: AuthenticatedConsumer,
  ) {
    return this.appointments.rescheduleForConsumer(id, dto, consumer);
  }
}
