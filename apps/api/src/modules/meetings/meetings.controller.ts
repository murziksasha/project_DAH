import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  CreateMeetingDto,
  SignMeetingDto,
  UpdateMeetingStatusDto,
  VoteAgendaDto,
} from './dto/meeting.dto';
import { MeetingsService } from './meetings.service';

const MANAGE = [UserRole.chairman, UserRole.board, UserRole.super_admin];

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

  @UseGuards(RolesGuard)
  @Roles(...MANAGE)
  @Post()
  create(@Body() dto: CreateMeetingDto, @CurrentUser() user: AuthUser) {
    return this.meetings.create(dto, user);
  }

  @UseGuards(RolesGuard)
  @Roles(...MANAGE)
  @Patch(':id/status')
  setStatus(
    @Param('id') id: string,
    @Body() dto: UpdateMeetingStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.meetings.setStatus(id, dto.status, user);
  }

  @Post(':id/register')
  register(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.meetings.register(id, user);
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

  @UseGuards(RolesGuard)
  @Roles(...MANAGE)
  @Post(':id/protocol')
  protocol(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.meetings.buildProtocol(id, user);
  }
}
