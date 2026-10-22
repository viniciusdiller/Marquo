import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { RefreshDto } from "./dto/refresh.dto";
import { SetPasswordDto } from "./dto/set-password.dto";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { PasswordResetService } from "./password-reset.service";
import { Public } from "../common/decorators/public.decorator";

// Login/refresh/set-password só tinham o limite global (100 req/min por IP) — a maior
// superfície de tentativa de senha do app sem nenhum throttle dedicado. Mesmo limite (10/min)
// já usado em consumer-auth pro mesmo tipo de rota.
const AUTH_THROTTLE = { default: { limit: 10, ttl: 60_000 } };
// Cada pedido pode virar um e-mail: bem mais estrito que o login (5 a cada 15 min por IP).
const FORGOT_PASSWORD_THROTTLE = { default: { limit: 5, ttl: 15 * 60_000 } };

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly passwordReset: PasswordResetService,
  ) {}

  @Public()
  @Throttle(AUTH_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @Post("login")
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @Post("refresh")
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post("logout")
  logout(@Body() dto: RefreshDto) {
    return this.authService.logout(dto.refreshToken);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Get("set-password/:token")
  checkSetPasswordToken(@Param("token") token: string) {
    return this.authService.checkSetPasswordToken(token);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @Post("set-password")
  setPassword(@Body() dto: SetPasswordDto) {
    return this.authService.setPassword(dto);
  }

  // Resposta idêntica exista a conta ou não (não revela cadastro); o envio acontece depois de responder.
  @Public()
  @Throttle(FORGOT_PASSWORD_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @Post("forgot-password")
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    this.passwordReset.request(dto.email);
    return { message: "Se o e-mail estiver cadastrado, enviamos um link para redefinir a senha." };
  }
}
