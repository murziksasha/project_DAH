import { Module, forwardRef } from '@nestjs/common';
import { MeetingsModule } from '../meetings/meetings.module';
import { KepController } from './kep.controller';
import { KepService } from './kep.service';

@Module({
  imports: [forwardRef(() => MeetingsModule)],
  controllers: [KepController],
  providers: [KepService],
  exports: [KepService],
})
export class KepModule {}
