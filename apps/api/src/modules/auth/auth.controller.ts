import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import type { Request, Response } from 'express';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { clearAuthCookies, REFRESH_COOKIE, setAuthCookies } from './auth-cookies';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { Disable2faDto, Enable2faDto, Verify2faDto } from './dto/two-factor.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  private sessionMeta(req: Request) {
    const xf = req.headers['x-forwarded-for'];
    const ip =
      typeof xf === 'string'
        ? xf.split(',')[0]?.trim()
        : req.socket?.remoteAddress ?? undefined;
    return {
      userAgent: req.headers['user-agent'],
      ip,
    };
  }

  private attachCookies(res: Response, body: { refreshToken?: string }) {
    if (body.refreshToken) {
      setAuthCookies(res, body.refreshToken);
    }
  }

  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Get('apartments')
  listApartments() {
    return this.auth.listApartmentsForRegistration();
  }

  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(dto, this.sessionMeta(req));
    if ('refreshToken' in result && result.refreshToken) {
      this.attachCookies(res, result);
    }
    return result;
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('login/sms/request')
  requestSmsLogin(@Body() body: { phone: string }) {
    return this.auth.requestSmsLogin(body.phone);
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('login/sms/verify')
  async verifySmsLogin(
    @Body() body: { phone: string; code: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.verifySmsLogin(body.phone, body.code, this.sessionMeta(req));
    if ('refreshToken' in result && result.refreshToken) {
      this.attachCookies(res, result);
    }
    return result;
  }

  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('2fa/verify')
  async verify2fa(
    @Body() dto: Verify2faDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.verify2fa(dto.tempToken, dto.code, this.sessionMeta(req));
    this.attachCookies(res, result);
    return result;
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('refresh')
  async refresh(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const fromCookie =
      typeof req.cookies?.[REFRESH_COOKIE] === 'string'
        ? (req.cookies[REFRESH_COOKIE] as string)
        : undefined;
    const token = dto?.refreshToken || fromCookie;
    try {
      const result = await this.auth.refresh(token, this.sessionMeta(req));
      this.attachCookies(res, result);
      return result;
    } catch (err) {
      clearAuthCookies(res);
      throw err;
    }
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @Post('logout')
  async logout(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const fromCookie =
      typeof req.cookies?.[REFRESH_COOKIE] === 'string'
        ? (req.cookies[REFRESH_COOKIE] as string)
        : undefined;
    const result = await this.auth.logout(user.id, fromCookie);
    clearAuthCookies(res);
    return result;
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @Post('logout-all')
  async logoutAll(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.logoutAll(user.id);
    clearAuthCookies(res);
    return result;
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return user;
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @Get('profile')
  profile(@CurrentUser() user: AuthUser) {
    return this.auth.getProfile(user.id);
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @Patch('profile')
  updateProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.auth.updateProfile(user.id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @Get('2fa/status')
  twoFaStatus(@CurrentUser() user: AuthUser) {
    return this.auth.get2faStatus(user.id);
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @Post('2fa/setup')
  setup2fa(@CurrentUser() user: AuthUser) {
    return this.auth.setup2fa(user.id);
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @Post('2fa/enable')
  enable2fa(@CurrentUser() user: AuthUser, @Body() dto: Enable2faDto) {
    return this.auth.enable2fa(user.id, dto.code);
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @Post('2fa/disable')
  disable2fa(@CurrentUser() user: AuthUser, @Body() dto: Disable2faDto) {
    return this.auth.disable2fa(user.id, dto.password, dto.code);
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @Patch('email-notify')
  emailNotify(@CurrentUser() user: AuthUser, @Body() body: { enabled: boolean }) {
    return this.auth.setEmailNotify(user.id, Boolean(body.enabled));
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @Post('change-password')
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(user.id, dto.currentPassword, dto.newPassword);
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.chairman, UserRole.board)
  @Get('pending')
  pending() {
    return this.auth.getPendingUsers();
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.chairman, UserRole.board)
  @Patch('approve/:id')
  approve(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.auth.approveUser(id, user.id);
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.chairman, UserRole.board)
  @Patch('reject/:id')
  reject(
    @Param('id') id: string,
    @Body() body: { reason?: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.auth.rejectUser(id, user.id, body?.reason);
  }
}
