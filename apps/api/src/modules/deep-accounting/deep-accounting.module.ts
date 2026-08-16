import { Module, forwardRef } from '@nestjs/common';
import { AccountingPeriodsModule } from '../accounting-periods/accounting-periods.module';
import { AccrualsModule } from '../accruals/accruals.module';
import { AuditModule } from '../audit/audit.module';
import { DeepAccountingController } from './deep-accounting.controller';
import { DeepAccountingService } from './deep-accounting.service';

@Module({
  imports: [
    AuditModule,
    forwardRef(() => AccountingPeriodsModule),
    forwardRef(() => AccrualsModule),
  ],
  controllers: [DeepAccountingController],
  providers: [DeepAccountingService],
  exports: [DeepAccountingService],
})
export class DeepAccountingModule {}
