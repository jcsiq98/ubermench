import { Module, Global } from '@nestjs/common';
import { ContactsService } from './contacts.service';

@Global()
@Module({
  providers: [ContactsService],
  exports: [ContactsService],
})
export class ContactsModule {}
