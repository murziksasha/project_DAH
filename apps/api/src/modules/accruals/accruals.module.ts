import { Module, forwardRef } from '@nestjs/common';
import { AccountingPeriodsModule } from '../accounting-periods/accounting-periods.module';
import { AccrualsController } from './accruals.controller';
import { AccrualsService } from './accruals.service';
import { ReceiptPdfService } from './receipt-pdf.service';

@Module({
  imports: [forwardRef(() => AccountingPeriodsModule)],
  controllers: [AccrualsController],
  providers: [AccrualsService, ReceiptPdfService],
  exports: [AccrualsService],
})
export class AccrualsModule {}