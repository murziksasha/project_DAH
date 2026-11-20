import { Permission } from '@dah/shared';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString } from 'class-validator';
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

  @RequirePermissions(Permission.WORK_REQUESTS)
  @UseGuards(PermissionsGuard)
  @Post('classify-request')
  classify(@Body() dto: ClassifyRequestDto) {
    if (!this.copilot.isEnabled()) {
      return { enabled: false };
    }
    return this.copilot.classifyRequest(dto);
  }

  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permission.MANAGE_FINANCE, Permission.PLATFORM_ADMIN)
  @Post('match-hint')
  matchHint(@Body() dto: MatchHintDto) {
    if (!this.copilot.isEnabled()) {
      return { enabled: false };
    }
    return this.copilot.suggestPaymentMatch(dto.purpose);
  }

  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permission.MANAGE_COMMUNICATIONS, Permission.PLATFORM_ADMIN)
  @Post('draft-note')
  draftNote(@Body() dto: DraftNoteDto) {
    if (!this.copilot.isEnabled()) {
      return { enabled: false };
    }
    return this.copilot.draftBoardNote(dto);
  }
}
