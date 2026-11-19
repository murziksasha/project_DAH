import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Permission } from '@dah/shared';
import { Body, Controller, Get, Param, Patch, Post, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import {
  CreateMeetingDto,
  RegisterMeetingDto,
  SignMeetingDto,
  UpdateMeetingStatusDto,
  VoteAgendaDto,
} from './dto/meeting.dto';
import { MeetingsService } from './meetings.service';


@ApiTags('meetings')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('meetings')
export class MeetingsController {
  constructor(private meetings: MeetingsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.meetings.list(user);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.meetings.get(id, user);
  }

  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permission.MANAGE_COMMUNICATIONS, Permission.PLATFORM_ADMIN)
  @Post()
  create(@Body() dto: CreateMeetingDto, @CurrentUser() user: AuthUser) {
    return this.meetings.create(dto, user);
  }

  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permission.MANAGE_COMMUNICATIONS, Permission.PLATFORM_ADMIN)
  @Patch(':id/status')
  setStatus(
    @Param('id') id: string,
    @Body() dto: UpdateMeetingStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.meetings.setStatus(id, dto.status, user);
  }

  @Post(':id/register')
  register(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: RegisterMeetingDto,
  ) {
    return this.meetings.register(id, user, dto?.apartmentId);
  }

  @Post(':id/agenda/:agendaItemId/vote')
  vote(
    @Param('id') id: string,
    @Param('agendaItemId') agendaItemId: string,
    @Body() dto: VoteAgendaDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.meetings.vote(id, agendaItemId, dto, user);
  }

  @Post(':id/sign')
  sign(
    @Param('id') id: string,
    @Body() dto: SignMeetingDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.meetings.sign(id, dto, user);
  }

  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permission.MANAGE_COMMUNICATIONS, Permission.PLATFORM_ADMIN)
  @Post(':id/protocol')
  protocol(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.meetings.buildProtocol(id, user);
  }

  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permission.READ_AUDIT, Permission.MANAGE_COMMUNICATIONS, Permission.PLATFORM_ADMIN)
  @Get(':id/protocol.pdf')
  async protocolPdf(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.meetings.protocolPdf(id, user);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }
}
