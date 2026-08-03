import { Module, forwardRef } from '@nestjs/common';
import { KepModule } from '../kep/kep.module';
import { MeetingsController } from './meetings.controller';
import { MeetingsService } from './meetings.service';

@Module({
  imports: [forwardRef(() => KepModule)],
  controllers: [MeetingsController],
  providers: [MeetingsService],
  exports: [MeetingsService],
})
export class MeetingsModule {}
