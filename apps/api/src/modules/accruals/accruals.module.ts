import { Module } from '@nestjs/common';
import { AccrualsController } from './accruals.controller';
import { AccrualsService } from './accruals.service';
import { ReceiptPdfService } from './receipt-pdf.service';

@Module({
  controllers: [AccrualsController],
  providers: [AccrualsService, ReceiptPdfService],
  exports: [AccrualsService],
})
export class AccrualsModule {}