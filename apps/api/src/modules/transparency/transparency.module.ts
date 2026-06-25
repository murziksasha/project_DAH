import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { FinanceModule } from '../finance/finance.module';
import { PaymentsModule } from '../payments/payments.module';
import { TransparencyController } from './transparency.controller';
import { TransparencyService } from './transparency.service';

@Module({
  imports: [FinanceModule, PaymentsModule, DocumentsModule],
  controllers: [TransparencyController],
  providers: [TransparencyService],
})
export class TransparencyModule {}