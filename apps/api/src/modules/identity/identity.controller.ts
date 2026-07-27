import { Body, Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { clearAuthCookies, setAuthCookies } from '../auth/auth-cookies';
import { IdentityService } from './identity.service';

@ApiTags('identity')
@Controller('identity')
export class IdentityController {
  constructor(private identity: IdentityService) {}

  private sessionMeta(req: Request) {
    const xf = req.headers['x-forwarded-for'];
    const ip =
      typeof xf === 'string'
        ? xf.split(',')[0]?.trim()
        : req.socket?.remoteAddress ?? undefined;
    return { userAgent: req.headers['user-agent'], ip };
  }

  @Get('status')
  status() {
    return this.identity.status();
  }

  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('authorize')
  authorize(@Body() body: { returnTo?: string }) {
    return this.identity.startAuthorize(body.returnTo);
  }

  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('callback')
  async callback(
    @Body() body: { code?: string; state: string; phone?: string; email?: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const result = await this.identity.completeCallback(body, this.sessionMeta(req));
      if ('refreshToken' in result && result.refreshToken) {
        setAuthCookies(res, result.refreshToken);
      }
      return result;
    } catch (e) {
      clearAuthCookies(res);
      throw e;
    }
  }

  /** Mock IdP authorize HTML (IDENTITY_PROVIDER=mock). */
  @Get('mock/authorize')
  mockAuthorize(
    @Query('state') state: string,
    @Query('redirect_uri') redirectUri: string,
    @Query('nonce') nonce: string | undefined,
    @Query('return_to') returnTo: string | undefined,
    @Res() res: Response,
  ) {
    if (!state || !redirectUri) {
      res.status(400).send('state and redirect_uri required');
      return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(
      this.identity.mockAuthorizePage({
        state,
        redirect_uri: redirectUri,
        nonce,
        return_to: returnTo,
      }),
    );
  }
}
