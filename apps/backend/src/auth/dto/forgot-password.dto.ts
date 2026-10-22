import { IsEmail, MaxLength } from "class-validator";
import { NormalizeEmail } from "../../common/decorators/normalize-email.decorator";

export class ForgotPasswordDto {
  @IsEmail()
  @MaxLength(254)
  @NormalizeEmail()
  email!: string;
}
