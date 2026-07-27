import { Module } from '@nestjs/common';
import { OnlinePaymentsService } from './online-payments.service';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService, OnlinePaymentsService],
  exports: [PaymentsService, OnlinePaymentsService],
})
export class PaymentsModule {}
