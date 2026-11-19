import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { HealthService } from './health.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private health: HealthService) {}

  /** Public minimal probe for uptime monitors (no component details). */
  @Get()
  async check() {
    const full = await this.health.check();
    const buildSha = process.env.GIT_SHA || process.env.BUILD_SHA || undefined;
    return {
      status: full.status === 'down' ? 'down' : 'ok',
      service: 'dah-api',
      timestamp: full.timestamp,
      ...(buildSha ? { buildSha } : {}),
    };
  }

  /** Full component status — staff only. */
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(
    UserRole.super_admin,
    UserRole.chairman,
    UserRole.board,
    UserRole.accountant,
    UserRole.auditor,
  )
  @Get('details')
  details() {
    return this.health.check();
  }
}
