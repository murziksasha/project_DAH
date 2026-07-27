import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { CreateDocumentDto } from './dto/create-document.dto';
import { DocumentsService } from './documents.service';

class UpdateDocumentVisibilityDto {
  @ApiProperty()
  @IsBoolean()
  isPublic!: boolean;
}

const WRITE_ROLES = [UserRole.chairman, UserRole.accountant, UserRole.board];

@ApiTags('documents')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('documents')
export class DocumentsController {
  constructor(private documents: DocumentsService) {}

  @Get('public')
  listPublic() {
    return this.documents.listPublic();
  }

  @UseGuards(RolesGuard)
  @Roles(...WRITE_ROLES)
  @Get()
  listAll() {
    return this.documents.listAll();
  }

  @UseGuards(RolesGuard)
  @Roles(...WRITE_ROLES)
  @Post()
  create(@Body() dto: CreateDocumentDto, @CurrentUser() user: AuthUser) {
    return this.documents.create(dto, user.id);
  }

  @UseGuards(RolesGuard)
  @Roles(...WRITE_ROLES)
  @Patch(':id/visibility')
  setVisibility(
    @Param('id') id: string,
    @Body() dto: UpdateDocumentVisibilityDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.documents.setPublic(id, dto.isPublic, user.id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.chairman, UserRole.accountant)
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.documents.remove(id, user.id);
  }
}