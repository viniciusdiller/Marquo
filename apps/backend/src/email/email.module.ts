import { NotificationWorkerService } from "./notification-worker.service";
import { Module } from "@nestjs/common";
import { EmailService } from "./email.service";
import { AppointmentNotifierService } from "./appointment-notifier.service";

@Module({
  providers: [EmailService, AppointmentNotifierService, NotificationWorkerService],
  exports: [EmailService, AppointmentNotifierService],
})
export class EmailModule {}
