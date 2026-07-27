import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class BootstrapService implements OnModuleInit {
  private readonly logger = new Logger(BootstrapService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  async onModuleInit() {
    const email = this.config.get<string>('SUPER_ADMIN_EMAIL');
    const password = this.config.get<string>('SUPER_ADMIN_PASSWORD');

    if (!email || !password) {
      const count = await this.prisma.user.count();
      if (count === 0) {
        this.logger.warn(
          'No users in database and SUPER_ADMIN_EMAIL/SUPER_ADMIN_PASSWORD not set — bootstrap skipped',
        );
      }
      return;
    }

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      if (existing.role !== UserRole.super_admin) {
        this.logger.warn(`SUPER_ADMIN_EMAIL (${email}) is taken by role ${existing.role}`);
      }
      return;
    }

    // Ensure default tenant exists (migration may have created it)
    let tenant = await this.prisma.tenant.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!tenant) {
      tenant = await this.prisma.tenant.create({
        data: { name: 'Default OSBB', slug: 'default' },
      });
      this.logger.log(`Bootstrap: created default tenant ${tenant.slug}`);
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName: 'Системний',
        lastName: 'Адміністратор',
        role: UserRole.super_admin,
        status: UserStatus.active,
        tenantId: null,
      },
    });

    this.logger.log(`Bootstrap: created super_admin user (${email})`);
  }
}