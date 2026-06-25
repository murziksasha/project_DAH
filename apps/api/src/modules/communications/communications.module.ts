import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { CommunicationsController } from './communications.controller';
import { CommunicationsService } from './communications.service';

@Module({
  imports: [NotificationsModule],
  controllers: [CommunicationsController],
  providers: [CommunicationsService],
})
export class CommunicationsModule {}