import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CommunicationsService } from './communications.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { CreatePollDto } from './dto/create-poll.dto';
import { CreateRequestDto } from './dto/create-request.dto';
import { UpdateRequestDto } from './dto/update-request.dto';
import { VotePollDto } from './dto/vote-poll.dto';

const WRITE_ROLES = [UserRole.chairman, UserRole.accountant, UserRole.board];
const REQUEST_MANAGE_ROLES = [
  UserRole.chairman,
  UserRole.board,
  UserRole.dispatcher,
  UserRole.accountant,
];
const REQUEST_WORK_ROLES = [
  ...REQUEST_MANAGE_ROLES,
  UserRole.crew,
];

@ApiTags('communications')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('communications')
export class CommunicationsController {
  constructor(private communications: CommunicationsService) {}

  @Get('announcements')
  listAnnouncements() {
    return this.communications.listAnnouncements();
  }

  @UseGuards(RolesGuard)
  @Roles(...WRITE_ROLES)
  @Post('announcements')
  createAnnouncement(
    @Body() dto: CreateAnnouncementDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.communications.createAnnouncement(dto, user.id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.chairman, UserRole.board)
  @Delete('announcements/:id')
  deleteAnnouncement(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.communications.deleteAnnouncement(id, user.id);
  }

  @Get('requests')
  listRequests(@CurrentUser() user: AuthUser) {
    return this.communications.listRequests(user);
  }

  /** Dispatcher / board / crew SLA queue (open tickets + filters). */
  @UseGuards(RolesGuard)
  @Roles(...REQUEST_WORK_ROLES)
  @Get('requests/queue')
  listRequestQueue(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: string,
    @Query('overdueOnly') overdueOnly?: string,
    @Query('unassignedOnly') unassignedOnly?: string,
    @Query('mineOnly') mineOnly?: string,
    @Query('priority') priority?: string,
  ) {
    return this.communications.listRequestQueue(user, {
      status,
      overdueOnly: overdueOnly === '1' || overdueOnly === 'true',
      unassignedOnly: unassignedOnly === '1' || unassignedOnly === 'true',
      mineOnly: mineOnly === '1' || mineOnly === 'true',
      priority,
    });
  }

  @Post('requests')
  createRequest(@Body() dto: CreateRequestDto, @CurrentUser() user: AuthUser) {
    return this.communications.createRequest(dto, user.id);
  }

  @UseGuards(RolesGuard)
  @Roles(...REQUEST_WORK_ROLES)
  @Patch('requests/:id')
  updateRequest(
    @Param('id') id: string,
    @Body() dto: UpdateRequestDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.communications.updateRequest(id, dto, user.id, user.role);
  }

  @Get('polls')
  listPolls(@CurrentUser() user: AuthUser) {
    return this.communications.listPolls(user.id);
  }

  @Get('polls/:id')
  getPoll(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.communications.getPoll(id, user.id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.chairman, UserRole.board)
  @Post('polls')
  createPoll(@Body() dto: CreatePollDto, @CurrentUser() user: AuthUser) {
    return this.communications.createPoll(dto, user.id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.chairman, UserRole.accountant, UserRole.board, UserRole.resident)
  @Post('polls/:id/vote')
  votePoll(
    @Param('id') id: string,
    @Body() dto: VotePollDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.communications.votePoll(id, dto.optionId, user.id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.chairman, UserRole.board)
  @Patch('polls/:id/close')
  closePoll(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.communications.closePoll(id, user.id);
  }
}