import { Module } from "@nestjs/common";
import { AppointmentsService } from "./appointments.service";
import {
  AppointmentsController,
  PublicAppointmentsController,
  ConsumerAppointmentsController,
} from "./appointments.controller";
import { ClientsModule } from "../clients/clients.module";
import { ConsumerAuthModule } from "../consumer-auth/consumer-auth.module";
import { EmailModule } from "../email/email.module";
import { AppointmentReminderService } from "./appointment-reminder.service";

@Module({
  imports: [ClientsModule, ConsumerAuthModule, EmailModule],
  controllers: [
    AppointmentsController,
    PublicAppointmentsController,
      ConsumerAppointmentsController,
  ],
  providers: [AppointmentsService, AppointmentReminderService],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
