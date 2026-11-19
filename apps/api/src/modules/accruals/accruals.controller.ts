import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Header,
  NotFoundException,
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
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AccrualsService } from './accruals.service';
import { TenantAccessService } from '../../common/tenant-access/tenant-access.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAccrualDto } from './dto/create-accrual.dto';
import { CreateAccrualTemplateDto } from './dto/create-accrual-template.dto';

const WRITE_ROLES = [UserRole.chairman, UserRole.accountant, UserRole.board];
const READ_ROLES: UserRole[] = [
  UserRole.chairman,
  UserRole.accountant,
  UserRole.board,
  UserRole.auditor,
  UserRole.super_admin,
];
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
  constructor(
    private accruals: AccrualsService,
    private access: TenantAccessService,
    private prisma: PrismaService,
  ) {}

  /** Accrual must belong to a fund of the caller's organization (404 otherwise). */
  private async assertAccrual(user: AuthUser, tenantId: string | null | undefined, id: string) {
    const row = await this.prisma.accrual.findUnique({
      where: { id },
      select: { fund: { select: { buildingId: true } } },
    });
    if (!row) throw new NotFoundException('Нарахування не знайдено');
    await this.access.assertBuilding(user, row.fund.buildingId, tenantId);
  }

  private async assertTemplate(user: AuthUser, tenantId: string | null | undefined, id: string) {
    const row = await this.prisma.accrualTemplate.findUnique({
      where: { id },
      select: { fund: { select: { buildingId: true } } },
    });
    if (!row) throw new NotFoundException('Шаблон не знайдено');
    await this.access.assertBuilding(user, row.fund.buildingId, tenantId);
    return row.fund.buildingId;
  }

  @UseGuards(RolesGuard)
  @Roles(...READ_ROLES)
  @Get('templates')
  listTemplates(
    @Query('buildingId') buildingId?: string,
    @TenantId() tenantId?: string | null,
  ) {
    return this.accruals.listTemplates(buildingId, tenantId);
  }

  @UseGuards(RolesGuard)
  @Roles(...WRITE_ROLES)
  @Post('templates')
  async createTemplate(
    @Body() dto: CreateAccrualTemplateDto,
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId: string | null,
  ) {
    await this.access.assertFund(user, dto.fundId, tenantId);
    return this.accruals.createTemplate(dto);
  }

  @UseGuards(RolesGuard)
  @Roles(...WRITE_ROLES)
  @Delete('templates/:id')
  async deleteTemplate(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId: string | null,
  ) {
    await this.assertTemplate(user, tenantId, id);
    return this.accruals.deleteTemplate(id);
  }

  @UseGuards(RolesGuard)
  @Roles(...READ_ROLES)
  @Get()
  listAccruals(
    @Query('period') period?: string,
    @Query('buildingId') buildingId?: string,
    @TenantId() tenantId?: string | null,
  ) {
    return this.accruals.listAccruals(period, buildingId, tenantId);
  }

  @Get('my-account')
  myAccount(
    @CurrentUser() user: AuthUser,
    @Query('apartmentId') apartmentId?: string,
  ) {
    const allowed = user.apartmentIds?.length
      ? user.apartmentIds
      : user.apartmentId
        ? [user.apartmentId]
        : [];
    const requested = apartmentId?.trim() || null;
    if (requested) {
      if (allowed.length && !allowed.includes(requested)) {
        throw new ForbiddenException('Немає доступу до цієї квартири');
      }
      return this.accruals.getMyAccount(requested);
    }
    return this.accruals.getMyAccount(user.apartmentId);
  }

  @UseGuards(RolesGuard)
  @Roles(...ADMIN_ROLES)
  @Get('apartments/:apartmentId/account')
  async apartmentAccount(
    @Param('apartmentId') apartmentId: string,
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId: string | null,
  ) {
    await this.access.assertApartment(user, apartmentId, tenantId);
    return this.accruals.getApartmentAccount(apartmentId);
  }

  @UseGuards(RolesGuard)
  @Roles(...ADMIN_ROLES, UserRole.resident)
  @Get('apartments/:apartmentId/statement.xlsx')
  async apartmentStatement(
    @Param('apartmentId') apartmentId: string,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
    @TenantId() tenantId: string | null,
  ) {
    // Staff: apartment must be in their organization; resident: own apartment only.
    await this.access.assertApartment(user, apartmentId, tenantId);
    if (user.role === UserRole.resident) {
      const ids = user.apartmentIds?.length
        ? user.apartmentIds
        : user.apartmentId
          ? [user.apartmentId]
          : [];
      if (!ids.includes(apartmentId)) {
        res.status(403).send('Forbidden');
        return;
      }
    }
    const { buffer, filename } = await this.accruals.exportApartmentStatementXlsx(apartmentId);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @UseGuards(RolesGuard)
  @Roles(...WRITE_ROLES)
  @Post('preview')
  async preview(
    @Body() dto: CreateAccrualDto,
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId: string | null,
  ) {
    await this.access.assertFund(user, dto.fundId, tenantId);
    return this.accruals.previewAmounts(dto);
  }

  @UseGuards(RolesGuard)
  @Roles(...WRITE_ROLES)
  @Post()
  async create(
    @Body() dto: CreateAccrualDto,
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId: string | null,
  ) {
    const fund = await this.access.assertFund(user, dto.fundId, tenantId);
    if (dto.templateId) {
      const tplBuilding = await this.assertTemplate(user, tenantId, dto.templateId);
      if (tplBuilding !== fund.buildingId) throw new NotFoundException('Шаблон не знайдено');
    }
    return this.accruals.createAccrual(dto, user.id);
  }

  @UseGuards(RolesGuard)
  @Roles(...WRITE_ROLES)
  @Post(':id/reverse')
  async reverse(
    @Param('id') id: string,
    @Body() body: { reason?: string },
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId: string | null,
  ) {
    await this.assertAccrual(user, tenantId, id);
    return this.accruals.reverseAccrual(id, user.id, body?.reason);
  }

  @UseGuards(RolesGuard)
  @Roles(...WRITE_ROLES)
  @Post('lines/:lineId/credit-note')
  async creditNote(
    @Param('lineId') lineId: string,
    @Body() body: { amount: number; reason?: string },
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId: string | null,
  ) {
    const line = await this.prisma.accrualLine.findUnique({
      where: { id: lineId },
      select: { apartmentId: true },
    });
    if (!line) throw new NotFoundException('Рядок нарахування не знайдено');
    await this.access.assertApartment(user, line.apartmentId, tenantId);
    return this.accruals.creditNoteLine(
      lineId,
      Number(body.amount),
      user.id,
      body?.reason,
    );
  }

  @Get('lines/:lineId/receipt')
  @Header('Content-Type', 'application/pdf')
  async receipt(
    @Param('lineId') lineId: string,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
    @TenantId() tenantId: string | null,
  ) {
    const isAdmin = ADMIN_ROLES.includes(user.role as UserRole);
    if (isAdmin) {
      // Staff of org A must not download receipts (names, IBAN, debt) of org B.
      const line = await this.prisma.accrualLine.findUnique({
        where: { id: lineId },
        select: { apartmentId: true },
      });
      if (!line) throw new NotFoundException('Рядок нарахування не знайдено');
      await this.access.assertApartment(user, line.apartmentId, tenantId);
    }
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
  async receiptsZip(
    @Param('id') id: string,
    @Res() res: Response,
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId: string | null,
  ) {
    await this.assertAccrual(user, tenantId, id);
    const { buffer, filename } = await this.accruals.generateAccrualReceiptsZip(id);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @UseGuards(RolesGuard)
  @Roles(...ADMIN_ROLES)
  @Get(':id/receipts.pdf')
  async receiptsPdf(
    @Param('id') id: string,
    @Res() res: Response,
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId: string | null,
  ) {
    await this.assertAccrual(user, tenantId, id);
    const { buffer, filename } = await this.accruals.generateAccrualReceiptsPdf(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  /** Full accrual with every apartment line — staff only, own organization (H1). */
  @UseGuards(RolesGuard)
  @Roles(...READ_ROLES)
  @Get(':id')
  async getOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId: string | null,
  ) {
    await this.assertAccrual(user, tenantId, id);
    return this.accruals.getAccrual(id);
  }
}