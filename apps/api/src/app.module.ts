import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
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
import { BootstrapModule } from './modules/bootstrap/bootstrap.module';
import { PrismaModule } from './prisma/prisma.module';
import { SetupModule } from './modules/setup/setup.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60000, limit: 120 }],
    }),
    PrismaModule,
    BootstrapModule,
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
    UsersModule,
    SetupModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}