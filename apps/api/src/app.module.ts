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
import { MailModule } from './modules/mail/mail.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { BootstrapModule } from './modules/bootstrap/bootstrap.module';
import { PrismaModule } from './prisma/prisma.module';
import { RemindersModule } from './modules/reminders/reminders.module';
import { SetupModule } from './modules/setup/setup.module';
import { UsersModule } from './modules/users/users.module';
import { RolesModule } from './modules/roles/roles.module';
import { JournalModule } from './modules/journal/journal.module';
import { MetersModule } from './modules/meters/meters.module';
import { SmsModule } from './modules/sms/sms.module';
import { IdentityModule } from './modules/identity/identity.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { BackupsModule } from './modules/backups/backups.module';
import { MeetingsModule } from './modules/meetings/meetings.module';
import { MessengerModule } from './modules/messenger/messenger.module';
import { KepModule } from './modules/kep/kep.module';
import { AccountingPeriodsModule } from './modules/accounting-periods/accounting-periods.module';
import { CopilotModule } from './modules/copilot/copilot.module';
import { DeepAccountingModule } from './modules/deep-accounting/deep-accounting.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60000, limit: 120 }],
    }),
    PrismaModule,
    JournalModule,
    MetersModule,
    SmsModule,
    IdentityModule,
    TenantsModule,
    MailModule,
    BootstrapModule,
    AuditModule,
    BackupsModule,
    HealthModule,
    AuthModule,
    AccrualsModule,
    BuildingModule,
    CommunicationsModule,
    DocumentsModule,
    FilesModule,
    FinanceModule,
    AccountingPeriodsModule,
    DeepAccountingModule,
    CopilotModule,
    NotificationsModule,
    PaymentsModule,
    RemindersModule,
    TransparencyModule,
    UsersModule,
    RolesModule,
    SetupModule,
    MeetingsModule,
    MessengerModule,
    KepModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}