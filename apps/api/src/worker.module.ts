import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuditModule } from './modules/audit/audit.module';
import { BackupsModule } from './modules/backups/backups.module';
import { JournalModule } from './modules/journal/journal.module';
import { MailModule } from './modules/mail/mail.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { RemindersModule } from './modules/reminders/reminders.module';
import { PrismaModule } from './prisma/prisma.module';

/**
 * Minimal Nest context for the background worker.
 * Avoids loading full AppModule (auth, finance, kep, messenger, throttler, …).
 * Journal included for daily reconcile (Package E).
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    MailModule,
    AuditModule,
    RemindersModule,
    BackupsModule,
    NotificationsModule,
    JournalModule,
  ],
})
export class WorkerModule {}
