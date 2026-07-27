import { Global, Module } from '@nestjs/common';
import { JournalController } from './journal.controller';
import { JournalService } from './journal.service';

@Global()
@Module({
  controllers: [JournalController],
  providers: [JournalService],
  exports: [JournalService],
})
export class JournalModule {}
