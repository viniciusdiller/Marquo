import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ConsumerAuthService } from "./consumer-auth.service";
import {
  ChangeConsumerPasswordDto,
  ConsumerLoginDto,
  RegisterConsumerDto,
  RequestRegisterCodeDto,
  UpdateConsumerProfileDto,
} from "./dto/consumer-dtos";
import { ConsumerEmailCodeService } from "./consumer-email-code.service";
import { ConsumerJwtAuthGuard } from "./guards/consumer-jwt-auth.guard";
import { CurrentConsumer } from "./decorators/current-consumer.decorator";
import { AuthenticatedConsumer } from "./types/consumer-auth-user";
import { PaginationQueryDto } from "../common/pagination/pagination-query.dto";
import { Public } from "../common/decorators/public.decorator";

@Controller("public/consumer")
export class ConsumerAuthController {
  constructor(
    private readonly consumerAuth: ConsumerAuthService,
    private readonly emailCodes: ConsumerEmailCodeService,
  ) {}

  // Passo 1 do cadastro: pede o código de confirmação do e-mail. Cada pedido pode virar um e-mail, então o limite por IP é
  // bem mais estrito que o do cadastro. A resposta é igual exista conta com esse e-mail ou não; `required` só diz se a tela
  // precisa pedir o código (falso em desenvolvimento sem e-mail configurado).
  @Public()
  @Throttle({ default: { limit: 5, ttl: 15 * 60_000 } })
  @HttpCode(200)
  @Post("register/code")
  requestRegisterCode(@Body() dto: RequestRegisterCodeDto) {
    const mode = this.emailCodes.mode();
    if (mode === "unavailable") {
      throw new ServiceUnavailableException("Não foi possível concluir o cadastro agora. Tente novamente mais tarde.");
    }
    this.emailCodes.request(dto.email);
    return { required: mode === "required" };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("register")
  register(@Body() dto: RegisterConsumerDto, @Headers("user-agent") userAgent?: string) {
    return this.consumerAuth.register(dto, userAgent);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("login")
  login(@Body() dto: ConsumerLoginDto, @Headers("user-agent") userAgent?: string) {
    return this.consumerAuth.login(dto, userAgent);
  }

  // Chamado pelo proxy.ts (frontend) perto do vencimento do token, em navegação normal — é o
  // que faz a sessão "nunca sair" enquanto o cliente volta ao site dentro da janela.
  @Public()
  @UseGuards(ConsumerJwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("refresh")
  refresh(@CurrentConsumer() consumer: AuthenticatedConsumer) {
    return this.consumerAuth.refresh(consumer);
  }

  @Public()
  @UseGuards(ConsumerJwtAuthGuard)
  @Get("me")
  me(@CurrentConsumer() consumer: AuthenticatedConsumer) {
    return this.consumerAuth.me(consumer);
  }

  @Public()
  @UseGuards(ConsumerJwtAuthGuard)
  @Get("establishments")
  establishments(
    @CurrentConsumer() consumer: AuthenticatedConsumer,
    @Query() query: PaginationQueryDto,
  ) {
    return this.consumerAuth.listEstablishments(consumer, query);
  }

  @Public()
  @UseGuards(ConsumerJwtAuthGuard)
  @Patch("me")
  updateProfile(@CurrentConsumer() consumer: AuthenticatedConsumer, @Body() dto: UpdateConsumerProfileDto) {
    return this.consumerAuth.updateProfile(consumer, dto);
  }

  @Public()
  @UseGuards(ConsumerJwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Patch("password")
  changePassword(
    @CurrentConsumer() consumer: AuthenticatedConsumer,
    @Body() dto: ChangeConsumerPasswordDto,
    @Headers("user-agent") userAgent?: string,
  ) {
    return this.consumerAuth.changePassword(consumer, dto, userAgent);
  }

  @Public()
  @UseGuards(ConsumerJwtAuthGuard)
  @Delete("me")
  deleteAccount(@CurrentConsumer() consumer: AuthenticatedConsumer) {
    return this.consumerAuth.deleteAccount(consumer);
  }

  // Dispositivos conectados — ver ConsumerAuthService.listSessions/revokeSession/revokeOtherSessions.
  @Public()
  @UseGuards(ConsumerJwtAuthGuard)
  @Get("sessions")
  listSessions(@CurrentConsumer() consumer: AuthenticatedConsumer) {
    return this.consumerAuth.listSessions(consumer);
  }

  @Public()
  @UseGuards(ConsumerJwtAuthGuard)
  @Delete("sessions")
  revokeOtherSessions(@CurrentConsumer() consumer: AuthenticatedConsumer) {
    return this.consumerAuth.revokeOtherSessions(consumer);
  }

  @Public()
  @UseGuards(ConsumerJwtAuthGuard)
  @Delete("sessions/:id")
  revokeSession(@CurrentConsumer() consumer: AuthenticatedConsumer, @Param("id") id: string) {
    return this.consumerAuth.revokeSession(consumer, id);
  }
}
