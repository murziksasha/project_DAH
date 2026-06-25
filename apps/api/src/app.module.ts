import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AccrualsModule } from './modules/accruals/accruals.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { BuildingModule } from './modules/building/building.module';
import { CommunicationsModule } from './modules/communications/communications.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { FilesModule } from './modules/files/files.module';
import { FinanceModule } from './modules/finance/finance.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { TransparencyModule } from './modules/transparency/transparency.module';
import { HealthModule } from './modules/health/health.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuditModule,
    HealthModule,
    AuthModule,
    AccrualsModule,
    BuildingModule,
    CommunicationsModule,
    DocumentsModule,
    FilesModule,
    FinanceModule,
    NotificationsModule,
    PaymentsModule,
    TransparencyModule,
  ],
})
export class AppModule {}