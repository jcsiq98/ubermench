import { Module, Global } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';

@Global()
@Module({
  providers: [AppointmentsService],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
