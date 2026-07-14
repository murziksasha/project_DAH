import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const APP_VERSION = process.env.npm_package_version ?? process.env.DAH_VERSION ?? '0.9.0';

@Injectable()
export class HealthService {
  constructor(private prisma: PrismaService) {}

  async check() {
    let db: 'up' | 'down' = 'down';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      db = 'up';
    } catch {
      db = 'down';
    }

    return {
      status: db === 'up' ? 'ok' : 'degraded',
      service: 'dah-api',
      version: APP_VERSION,
      db,
      timestamp: new Date().toISOString(),
    };
  }
}
