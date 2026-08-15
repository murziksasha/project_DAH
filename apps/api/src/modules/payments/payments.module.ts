import { Module, forwardRef } from '@nestjs/common';
import { AccountingPeriodsModule } from '../accounting-periods/accounting-periods.module';
import { OnlinePaymentsService } from './online-payments.service';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [forwardRef(() => AccountingPeriodsModule)],
  controllers: [PaymentsController],
  providers: [PaymentsService, OnlinePaymentsService],
  exports: [PaymentsService, OnlinePaymentsService],
})
export class PaymentsModule {}
