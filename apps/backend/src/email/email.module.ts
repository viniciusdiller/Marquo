import { Module } from "@nestjs/common";
import { EmailService } from "./email.service";
import { AppointmentNotifierService } from "./appointment-notifier.service";

@Module({
  providers: [EmailService, AppointmentNotifierService],
  exports: [EmailService, AppointmentNotifierService],
})
export class EmailModule {}
