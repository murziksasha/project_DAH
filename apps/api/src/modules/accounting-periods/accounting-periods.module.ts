import { Module, forwardRef } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AccountingPeriodsController } from './accounting-periods.controller';
import { AccountingPeriodsService } from './accounting-periods.service';

@Module({
  imports: [AuditModule],
  controllers: [AccountingPeriodsController],
  providers: [AccountingPeriodsService],
  exports: [AccountingPeriodsService],
})
export class AccountingPeriodsModule {}
