import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { MeetingsService } from '../meetings/meetings.service';
import { CompleteKepSignDto, StartKepSignDto } from './dto/kep.dto';
import { KepService } from './kep.service';
import type { KepProvider } from './kep.types';

@ApiTags('kep')
@Controller('kep')
export class KepController {
  constructor(
    private kep: KepService,
    private meetings: MeetingsService,
  ) {}

  @Get('status')
  status() {
    return this.kep.status();
  }

  /** Mock QES page (browser). */
  @Get('mock/authorize')
  mockAuthorize(@Query('sessionId') sessionId: string, @Res() res: Response) {
    if (!sessionId) {
      res.status(400).send('sessionId required');
      return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(this.kep.mockAuthorizePage(sessionId));
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @Get('sessions/:id')
  getSession(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.kep.getSession(id, user.id);
  }

  /**
   * Complete without JWT for mock page; with JWT for cades/code.
   * Mock complete is open only for mock provider sessions (checked in service path via public complete).
   */
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post('sessions/:id/complete')
  async completePublic(
    @Param('id') id: string,
    @Body() dto: CompleteKepSignDto,
  ) {
    // Public complete for mock IdP page (and diia mock fallback deeplink)
    const session = await this.kep.getSession(id);
    if (session.provider !== 'mock') {
      // Real diia/cloud must use webhook or complete-auth with JWT
      const isDiiaMockDeeplink =
        session.provider === 'diia' &&
        Boolean(session.authorizeUrl?.includes('/kep/mock/'));
      if (!isDiiaMockDeeplink) {
        throw new BadRequestException(
          'Для цього провайдера використайте webhook або POST .../complete-auth з JWT',
        );
      }
    }
    return this.kep.completeSession({
      sessionId: id,
      code: dto.code ?? 'mock_ok',
      signatureCms: dto.signatureCms,
      certificateSubject: dto.certificateSubject,
      certificateSerial: dto.certificateSerial,
      providerPayload: dto.providerPayload,
    });
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @Post('sessions/:id/complete-auth')
  completeAuth(
    @Param('id') id: string,
    @Body() dto: CompleteKepSignDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.kep.completeSession(
      {
        sessionId: id,
        code: dto.code,
        state: dto.state,
        signatureCms: dto.signatureCms,
        certificateSubject: dto.certificateSubject,
        certificateSerial: dto.certificateSerial,
        providerPayload: dto.providerPayload,
      },
      user.id,
    );
  }

  /** Start sign for a meeting protocol / snapshot. */
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @Post('meetings/:meetingId/sign')
  async signMeeting(
    @Param('meetingId') meetingId: string,
    @Body() dto: StartKepSignDto,
    @CurrentUser() user: AuthUser,
  ) {
    const doc = await this.meetings.buildSignDocument(meetingId, user);
    return this.kep.startSession({
      purpose: 'meeting_protocol',
      refType: 'Meeting',
      refId: meetingId,
      userId: user.id,
      documentTitle: doc.title,
      documentText: doc.text,
      provider: dto.provider as KepProvider | undefined,
      returnUrl: dto.returnUrl,
    });
  }

  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Post('webhook')
  webhook(
    @Body() body: Record<string, unknown>,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    return this.kep.handleWebhook(body, headers);
  }
}
