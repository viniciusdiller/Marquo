import { IsEmail, IsString, MaxLength, MinLength } from "class-validator";
import { NormalizeEmail } from "../../common/decorators/normalize-email.decorator";

export class VerifyEmailDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  token!: string;
}

export class ResendVerificationDto {
  @IsEmail()
  @MaxLength(254)
  @NormalizeEmail()
  email!: string;
}
