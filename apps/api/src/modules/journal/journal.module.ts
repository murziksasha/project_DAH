import { Global, Module } from '@nestjs/common';
import { JournalController } from './journal.controller';
import { JournalService } from './journal.service';
import { PostingService } from './posting.service';

@Global()
@Module({
  controllers: [JournalController],
  providers: [JournalService, PostingService],
  exports: [JournalService, PostingService],
})
export class JournalModule {}
