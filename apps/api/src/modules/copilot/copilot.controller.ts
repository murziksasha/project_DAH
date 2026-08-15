import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { IsNumber, IsOptional, IsString } from 'class-validator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CopilotService } from './copilot.service';

class ClassifyRequestDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  category?: string;
}

class MatchHintDto {
  @IsString()
  purpose!: string;
}

class DraftNoteDto {
  @IsString()
  period!: string;

  @IsOptional()
  @IsNumber()
  totalIncome?: number;

  @IsOptional()
  @IsNumber()
  totalExpenses?: number;

  @IsOptional()
  @IsNumber()
  debtorsCount?: number;

  @IsOptional()
  @IsNumber()
  openRequests?: number;
}

@ApiTags('copilot')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('copilot')
export class CopilotController {
  constructor(private copilot: CopilotService) {}

  @Get('status')
  status() {
    return {
      enabled: this.copilot.isEnabled(),
      mode: 'heuristic',
      note: 'No auto money moves; opt-out via COPILOT_ENABLED=false',
    };
  }

  @UseGuards(RolesGuard)
  @Roles(
    UserRole.dispatcher,
    UserRole.chairman,
    UserRole.board,
    UserRole.crew,
    UserRole.super_admin,
  )
  @Post('classify-request')
  classify(@Body() dto: ClassifyRequestDto) {
    if (!this.copilot.isEnabled()) {
      return { enabled: false };
    }
    return this.copilot.classifyRequest(dto);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.accountant, UserRole.chairman, UserRole.board, UserRole.super_admin)
  @Post('match-hint')
  matchHint(@Body() dto: MatchHintDto) {
    if (!this.copilot.isEnabled()) {
      return { enabled: false };
    }
    return this.copilot.suggestPaymentMatch(dto.purpose);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.chairman, UserRole.board, UserRole.super_admin)
  @Post('draft-note')
  draftNote(@Body() dto: DraftNoteDto) {
    if (!this.copilot.isEnabled()) {
      return { enabled: false };
    }
    return this.copilot.draftBoardNote(dto);
  }
}
