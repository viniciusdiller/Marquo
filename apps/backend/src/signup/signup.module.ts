import { Module } from "@nestjs/common";
import { CouponsModule } from "../coupons/coupons.module";
import { SignupController } from "./signup.controller";
import { SignupService } from "./signup.service";

@Module({
  imports: [CouponsModule],
  controllers: [SignupController],
  providers: [SignupService],
})
export class SignupModule {}
