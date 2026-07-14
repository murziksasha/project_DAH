import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Response } from 'express';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AccrualsService } from './accruals.service';
import { CreateAccrualDto } from './dto/create-accrual.dto';
import { CreateAccrualTemplateDto } from './dto/create-accrual-template.dto';

const WRITE_ROLES = [UserRole.chairman, UserRole.accountant, UserRole.board];
const ADMIN_ROLES: UserRole[] = [
  UserRole.chairman,
  UserRole.accountant,
  UserRole.board,
  UserRole.auditor,
];

@ApiTags('accruals')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('accruals')
export class AccrualsController {
  constructor(private accruals: AccrualsService) {}

  @Get('templates')
  listTemplates() {
    return this.accruals.listTemplates();
  }

  @UseGuards(RolesGuard)
  @Roles(...WRITE_ROLES)
  @Post('templates')
  createTemplate(@Body() dto: CreateAccrualTemplateDto) {
    return this.accruals.createTemplate(dto);
  }

  @UseGuards(RolesGuard)
  @Roles(...WRITE_ROLES)
  @Delete('templates/:id')
  deleteTemplate(@Param('id') id: string) {
    return this.accruals.deleteTemplate(id);
  }

  @Get()
  listAccruals(@Query('period') period?: string) {
    return this.accruals.listAccruals(period);
  }

  @Get('my-account')
  myAccount(@CurrentUser() user: AuthUser) {
    return this.accruals.getMyAccount(user.apartmentId);
  }

  @UseGuards(RolesGuard)
  @Roles(...ADMIN_ROLES)
  @Get('apartments/:apartmentId/account')
  apartmentAccount(@Param('apartmentId') apartmentId: string) {
    return this.accruals.getApartmentAccount(apartmentId);
  }

  @UseGuards(RolesGuard)
  @Roles(...WRITE_ROLES)
  @Post('preview')
  preview(@Body() dto: CreateAccrualDto) {
    return this.accruals.previewAmounts(dto);
  }

  @UseGuards(RolesGuard)
  @Roles(...WRITE_ROLES)
  @Post()
  create(@Body() dto: CreateAccrualDto, @CurrentUser() user: AuthUser) {
    return this.accruals.createAccrual(dto, user.id);
  }

  @Get('lines/:lineId/receipt')
  @Header('Content-Type', 'application/pdf')
  async receipt(
    @Param('lineId') lineId: string,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ) {
    const isAdmin = ADMIN_ROLES.includes(user.role as UserRole);
    const residentApartmentIds = user.apartmentIds?.length
      ? user.apartmentIds
      : user.apartmentId
        ? [user.apartmentId]
        : [];
    const pdf = await this.accruals.generateReceipt(lineId, residentApartmentIds, isAdmin);
    res.setHeader('Content-Disposition', `attachment; filename="receipt-${lineId.slice(-8)}.pdf"`);
    res.send(pdf);
  }

  @UseGuards(RolesGuard)
  @Roles(...ADMIN_ROLES)
  @Get(':id/receipts.zip')
  async receiptsZip(@Param('id') id: string, @Res() res: Response) {
    const { buffer, filename } = await this.accruals.generateAccrualReceiptsZip(id);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @UseGuards(RolesGuard)
  @Roles(...ADMIN_ROLES)
  @Get(':id/receipts.pdf')
  async receiptsPdf(@Param('id') id: string, @Res() res: Response) {
    const { buffer, filename } = await this.accruals.generateAccrualReceiptsPdf(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.accruals.getAccrual(id);
  }
}