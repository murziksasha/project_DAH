import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { PaymentsModule } from '../payments/payments.module';
import { BoardReportPdfService } from './board-report-pdf.service';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';

@Module({
  imports: [FilesModule, PaymentsModule],
  controllers: [FinanceController],
  providers: [FinanceService, BoardReportPdfService],
  exports: [FinanceService],
})
export class FinanceModule {}