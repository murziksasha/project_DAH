import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { MessengerService } from './messenger.service';

class PostMessageDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  body!: string;
}

class CreateDirectDto {
  @ApiProperty()
  @IsString()
  peerUserId!: string;
}

class EnsureThreadDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  buildingId?: string;
}

@ApiTags('messenger')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('messenger')
export class MessengerController {
  constructor(private messenger: MessengerService) {}

  @Get('threads')
  listThreads(@CurrentUser() user: AuthUser) {
    return this.messenger.listThreads(user);
  }

  @Get('peers')
  listPeers(@CurrentUser() user: AuthUser) {
    return this.messenger.listPeers(user);
  }

  @Post('threads/building')
  ensureBuilding(@Body() dto: EnsureThreadDto, @CurrentUser() user: AuthUser) {
    return this.messenger.ensureBuildingThread(user, dto.buildingId);
  }

  @Post('threads/board')
  ensureBoard(@Body() dto: EnsureThreadDto, @CurrentUser() user: AuthUser) {
    return this.messenger.ensureBoardResidentsThread(user, dto.buildingId);
  }

  @Post('threads/direct')
  createDirect(@Body() dto: CreateDirectDto, @CurrentUser() user: AuthUser) {
    return this.messenger.createDirect(user, dto.peerUserId);
  }

  @Get('threads/:id/messages')
  messages(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Query('limit') limit?: string,
  ) {
    return this.messenger.getMessages(id, user, limit ? Number(limit) : 50);
  }

  @Post('threads/:id/messages')
  post(
    @Param('id') id: string,
    @Body() dto: PostMessageDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.messenger.postMessage(id, dto.body, user);
  }
}
