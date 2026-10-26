import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CouponsModule } from "../coupons/coupons.module";
import { SignupController } from "./signup.controller";
import { SignupService } from "./signup.service";

@Module({
  imports: [CouponsModule, AuthModule],
  controllers: [SignupController],
  providers: [SignupService],
})
export class SignupModule {}
