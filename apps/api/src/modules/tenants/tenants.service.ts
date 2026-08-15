import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrganizationType, Prisma, UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ORG_ROLE_CODES, ORG_ROLE_SORT } from '../roles/org-roles';
import {
  buildTenantDeleteBlockers,
  canDeleteTenant,
  type TenantDeleteSummary,
} from './tenant-delete.util';

function parseOrgType(value?: string): OrganizationType {
  if (value === 'management_company') return OrganizationType.management_company;
  return OrganizationType.osbb;
}

@Injectable()
export class TenantsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  list() {
    return this.prisma.tenant.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        _count: { select: { buildings: true, users: true } },
      },
    });
  }

  async get(id: string) {
    const t = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        buildings: { select: { id: true, name: true, address: true } },
        _count: { select: { users: true, buildings: true } },
      },
    });
    if (!t) throw new NotFoundException('Організацію не знайдено');
    return t;
  }

  async create(
    dto: {
      name: string;
      slug: string;
      orgType?: string;
      chairmanEmail?: string;
      chairmanPassword?: string;
    },
    actorId: string,
  ) {
    const slug = dto.slug
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48);
    if (!slug) throw new BadRequestException('Некоректний slug');

    const exists = await this.prisma.tenant.findUnique({ where: { slug } });
    if (exists) throw new BadRequestException('Slug уже зайнятий');

    const orgType = parseOrgType(dto.orgType);
    const isUk = orgType === OrganizationType.management_company;

    const tenant = await this.prisma.$transaction(async (tx) => {
      const t = await tx.tenant.create({
        data: {
          name: dto.name.trim(),
          slug,
          orgType,
        },
      });
      await tx.building.create({
        data: {
          tenantId: t.id,
          name: dto.name.trim(),
          address: 'Адресу уточніть у налаштуваннях',
          isInitialized: false,
        },
      });
      await tx.tenantRole.createMany({
        data: ORG_ROLE_CODES.map((code) => ({
          tenantId: t.id,
          code,
          isActive: true,
          sortOrder: ORG_ROLE_SORT[code] ?? 100,
        })),
      });
      if (dto.chairmanEmail && dto.chairmanPassword) {
        const emailTaken = await tx.user.findUnique({ where: { email: dto.chairmanEmail } });
        if (emailTaken) {
          // Add membership if the identity exists and is not already in this tenant
          const existingMem = await tx.tenantMembership.findUnique({
            where: {
              userId_tenantId_role: {
                userId: emailTaken.id,
                tenantId: t.id,
                role: UserRole.chairman,
              },
            },
          });
          if (existingMem) {
            throw new BadRequestException(
              isUk ? 'Email керівника вже зайнятий' : 'Email голови вже зайнятий',
            );
          }
          if (emailTaken.role === UserRole.super_admin && !emailTaken.tenantId) {
            throw new BadRequestException(
              isUk ? 'Email керівника вже зайнятий' : 'Email голови вже зайнятий',
            );
          }
          await tx.tenantMembership.create({
            data: {
              userId: emailTaken.id,
              tenantId: t.id,
              role: UserRole.chairman,
              status: UserStatus.active,
            },
          });
        } else {
          const chairman = await tx.user.create({
            data: {
              email: dto.chairmanEmail,
              passwordHash: await bcrypt.hash(dto.chairmanPassword, 10),
              firstName: isUk ? 'Керівник' : 'Голова',
              lastName: dto.name.trim().slice(0, 40),
              role: UserRole.chairman,
              status: UserStatus.active,
              tenantId: t.id,
            },
          });
          await tx.tenantMembership.create({
            data: {
              userId: chairman.id,
              tenantId: t.id,
              role: UserRole.chairman,
              status: UserStatus.active,
            },
          });
        }
      }
      return t;
    });

    await this.audit.log({
      userId: actorId,
      action: 'tenant.created',
      entityType: 'Tenant',
      entityId: tenant.id,
      payload: { slug: tenant.slug, name: tenant.name, orgType: tenant.orgType },
    });
    return this.get(tenant.id);
  }

  async update(
    id: string,
    dto: { name?: string; isActive?: boolean; orgType?: string },
    actorId: string,
  ) {
    const t = await this.prisma.tenant.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('Організацію не знайдено');

    const deactivating = dto.isActive === false && t.isActive;

    const updated = await this.prisma.tenant.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.orgType !== undefined ? { orgType: parseOrgType(dto.orgType) } : {}),
      },
    });

    let revokedSessions = 0;
    let affectedUsers = 0;
    if (deactivating) {
      const users = await this.prisma.user.findMany({
        where: { tenantId: id },
        select: { id: true },
      });
      const userIds = users.map((u) => u.id);
      affectedUsers = userIds.length;
      if (userIds.length) {
        const result = await this.prisma.authSession.updateMany({
          where: { userId: { in: userIds }, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        revokedSessions = result.count;
        await this.prisma.user.updateMany({
          where: { id: { in: userIds } },
          data: { refreshToken: null },
        });
      }
    }

    await this.audit.log({
      userId: actorId,
      action: 'tenant.updated',
      entityType: 'Tenant',
      entityId: id,
      payload: {
        ...dto,
        ...(deactivating
          ? { sessionsRevoked: true, userCount: affectedUsers, revokedSessions }
          : {}),
      },
    });
    return updated;
  }

  async getDeleteCheck(id: string) {
    const t = await this.prisma.tenant.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('Організацію не знайдено');

    const summary = await this.collectDeleteSummary(id);
    const blockers = buildTenantDeleteBlockers(summary, { isActive: t.isActive });
    return {
      id: t.id,
      name: t.name,
      slug: t.slug,
      isActive: t.isActive,
      canDelete: canDeleteTenant(blockers),
      blockers,
      summary,
    };
  }

  /**
   * Hard-delete an inactive tenant with no finance movements.
   * Orphan users (no remaining memberships) are removed; shared identities are unlinked.
   */
  async delete(id: string, body: { confirmSlug?: string }, actorId: string) {
    const check = await this.getDeleteCheck(id);
    if (!check.canDelete) {
      const reasons = check.blockers
        .map((b) => (b.code === 'active' ? b.label : `${b.label}: ${b.count}`))
        .join('; ');
      throw new BadRequestException(
        reasons || 'Організацію не можна видалити',
      );
    }

    const confirm = (body.confirmSlug ?? '').trim().toLowerCase();
    if (!confirm || confirm !== check.slug.toLowerCase()) {
      throw new BadRequestException(
        `Для підтвердження введіть slug організації: ${check.slug}`,
      );
    }

    const buildings = await this.prisma.building.findMany({
      where: { tenantId: id },
      select: { id: true },
    });
    const buildingIds = buildings.map((b) => b.id);

    await this.prisma.$transaction(
      async (tx) => {
        for (const buildingId of buildingIds) {
          await this.purgeBuilding(tx, buildingId);
        }

        const memberUsers = await tx.tenantMembership.findMany({
          where: { tenantId: id },
          select: { userId: true },
          distinct: ['userId'],
        });
        const scopedUsers = await tx.user.findMany({
          where: { tenantId: id },
          select: { id: true },
        });
        const candidateIds = [
          ...new Set([
            ...memberUsers.map((m) => m.userId),
            ...scopedUsers.map((u) => u.id),
          ]),
        ];

        await tx.tenantMembership.deleteMany({ where: { tenantId: id } });
        await tx.tenantRole.deleteMany({ where: { tenantId: id } });

        await tx.user.updateMany({
          where: { tenantId: id },
          data: { tenantId: null },
        });

        for (const userId of candidateIds) {
          const remaining = await tx.tenantMembership.count({
            where: { userId },
          });
          const user = await tx.user.findUnique({
            where: { id: userId },
            select: { id: true, role: true, tenantId: true },
          });
          if (!user) continue;
          // Never delete platform super_admin
          if (user.role === UserRole.super_admin && !user.tenantId && remaining === 0) {
            continue;
          }
          if (remaining > 0) continue;

          await this.purgeOrphanUser(tx, userId);
        }

        await tx.tenant.delete({ where: { id } });
      },
      { timeout: 60_000 },
    );

    await this.audit.log({
      userId: actorId,
      action: 'tenant.deleted',
      entityType: 'Tenant',
      entityId: id,
      payload: {
        slug: check.slug,
        name: check.name,
        summary: check.summary,
      },
    });

    return { deleted: true, id, slug: check.slug };
  }

  private async collectDeleteSummary(tenantId: string): Promise<TenantDeleteSummary> {
    const buildings = await this.prisma.building.findMany({
      where: { tenantId },
      select: { id: true },
    });
    const buildingIds = buildings.map((b) => b.id);

    const apartments =
      buildingIds.length === 0
        ? []
        : await this.prisma.apartment.findMany({
            where: { buildingId: { in: buildingIds } },
            select: { id: true },
          });
    const apartmentIds = apartments.map((a) => a.id);

    const funds =
      buildingIds.length === 0
        ? []
        : await this.prisma.fund.findMany({
            where: { buildingId: { in: buildingIds } },
            select: { id: true },
          });
    const fundIds = funds.map((f) => f.id);

    const [
      memberships,
      usersScoped,
      payments,
      accrualLines,
      accruals,
      expenses,
      journalEntries,
      bankStatements,
      supplierInvoices,
      supplierPayments,
      debtWriteOffs,
      bankReconciliations,
      fundTransfers,
      onlinePaymentOrders,
    ] = await Promise.all([
      this.prisma.tenantMembership.count({ where: { tenantId } }),
      this.prisma.user.count({ where: { tenantId } }),
      apartmentIds.length
        ? this.prisma.payment.count({ where: { apartmentId: { in: apartmentIds } } })
        : Promise.resolve(0),
      apartmentIds.length
        ? this.prisma.accrualLine.count({ where: { apartmentId: { in: apartmentIds } } })
        : Promise.resolve(0),
      fundIds.length
        ? this.prisma.accrual.count({ where: { fundId: { in: fundIds } } })
        : Promise.resolve(0),
      fundIds.length
        ? this.prisma.expense.count({ where: { fundId: { in: fundIds } } })
        : Promise.resolve(0),
      buildingIds.length
        ? this.prisma.journalEntry.count({ where: { buildingId: { in: buildingIds } } })
        : Promise.resolve(0),
      buildingIds.length
        ? this.prisma.bankStatement.count({ where: { buildingId: { in: buildingIds } } })
        : Promise.resolve(0),
      buildingIds.length
        ? this.prisma.supplierInvoice.count({ where: { buildingId: { in: buildingIds } } })
        : Promise.resolve(0),
      buildingIds.length
        ? this.prisma.supplier
            .findMany({ where: { buildingId: { in: buildingIds } }, select: { id: true } })
            .then((suppliers) => {
              if (!suppliers.length) return 0;
              return this.prisma.supplierPayment.count({
                where: { supplierId: { in: suppliers.map((s) => s.id) } },
              });
            })
        : Promise.resolve(0),
      buildingIds.length
        ? this.prisma.debtWriteOff.count({ where: { buildingId: { in: buildingIds } } })
        : Promise.resolve(0),
      buildingIds.length
        ? this.prisma.bankReconciliation.count({ where: { buildingId: { in: buildingIds } } })
        : Promise.resolve(0),
      fundIds.length
        ? this.prisma.fundTransfer.count({
            where: {
              OR: [{ fromFundId: { in: fundIds } }, { toFundId: { in: fundIds } }],
            },
          })
        : Promise.resolve(0),
      apartmentIds.length
        ? this.prisma.onlinePaymentOrder.count({
            where: { apartmentId: { in: apartmentIds } },
          })
        : Promise.resolve(0),
    ]);

    const memberUserIds = await this.prisma.tenantMembership.findMany({
      where: { tenantId },
      select: { userId: true },
      distinct: ['userId'],
    });
    const userCount = new Set([
      ...memberUserIds.map((m) => m.userId),
      ...(
        await this.prisma.user.findMany({
          where: { tenantId },
          select: { id: true },
        })
      ).map((u) => u.id),
    ]).size;

    return {
      buildings: buildingIds.length,
      apartments: apartmentIds.length,
      users: userCount || usersScoped,
      memberships,
      payments,
      accrualLines,
      accruals,
      expenses,
      journalEntries,
      bankStatements,
      supplierInvoices,
      supplierPayments,
      debtWriteOffs,
      bankReconciliations,
      fundTransfers,
      onlinePaymentOrders,
    };
  }

  private async purgeBuilding(tx: Prisma.TransactionClient, buildingId: string) {
    const apartments = await tx.apartment.findMany({
      where: { buildingId },
      select: { id: true },
    });
    const apartmentIds = apartments.map((a) => a.id);

    if (apartmentIds.length) {
      await this.purgeApartments(tx, apartmentIds);
    }

    const funds = await tx.fund.findMany({
      where: { buildingId },
      select: { id: true },
    });
    const fundIds = funds.map((f) => f.id);

    if (fundIds.length) {
      await tx.fundTransfer.deleteMany({
        where: {
          OR: [{ fromFundId: { in: fundIds } }, { toFundId: { in: fundIds } }],
        },
      });
      // Accruals/expenses should be zero if canDelete, but clear templates safely
      const accruals = await tx.accrual.findMany({
        where: { fundId: { in: fundIds } },
        select: { id: true },
      });
      if (accruals.length) {
        const accrualIds = accruals.map((a) => a.id);
        const lines = await tx.accrualLine.findMany({
          where: { accrualId: { in: accrualIds } },
          select: { id: true },
        });
        const lineIds = lines.map((l) => l.id);
        if (lineIds.length) {
          await tx.paymentAllocation.deleteMany({
            where: { accrualLineId: { in: lineIds } },
          });
          await tx.accrualLine.deleteMany({ where: { id: { in: lineIds } } });
        }
        await tx.accrual.deleteMany({ where: { id: { in: accrualIds } } });
      }
      await tx.accrualTemplate.deleteMany({ where: { fundId: { in: fundIds } } });
      await tx.expense.deleteMany({ where: { fundId: { in: fundIds } } });
      await tx.serviceTariff.deleteMany({ where: { fundId: { in: fundIds } } });
      await tx.budgetLine.deleteMany({ where: { fundId: { in: fundIds } } });
    }

    const suppliers = await tx.supplier.findMany({
      where: { buildingId },
      select: { id: true },
    });
    const supplierIds = suppliers.map((s) => s.id);
    if (supplierIds.length) {
      const invoices = await tx.supplierInvoice.findMany({
        where: { buildingId },
        select: { id: true },
      });
      const invoiceIds = invoices.map((i) => i.id);
      if (invoiceIds.length) {
        await tx.supplierPaymentAllocation.deleteMany({
          where: { invoiceId: { in: invoiceIds } },
        });
      }
      const payments = await tx.supplierPayment.findMany({
        where: { supplierId: { in: supplierIds } },
        select: { id: true },
      });
      const paymentIds = payments.map((p) => p.id);
      if (paymentIds.length) {
        await tx.supplierPaymentAllocation.deleteMany({
          where: { paymentId: { in: paymentIds } },
        });
        await tx.supplierPayment.deleteMany({ where: { id: { in: paymentIds } } });
      }
      await tx.supplierInvoice.deleteMany({ where: { buildingId } });
      await tx.expense.updateMany({
        where: { supplierId: { in: supplierIds } },
        data: { supplierId: null },
      });
      await tx.supplier.deleteMany({ where: { buildingId } });
    }

    await tx.debtWriteOff.deleteMany({ where: { buildingId } });
    await tx.bankReconciliation.deleteMany({ where: { buildingId } });
    await tx.periodCloseSnapshot.deleteMany({ where: { buildingId } });
    await tx.accountingPeriod.deleteMany({ where: { buildingId } });
    await tx.budgetLine.deleteMany({ where: { buildingId } });
    await tx.serviceTariff.deleteMany({ where: { buildingId } });
    await tx.ibanApartmentAlias.deleteMany({ where: { buildingId } });

    const statements = await tx.bankStatement.findMany({
      where: { buildingId },
      select: { id: true },
    });
    if (statements.length) {
      await tx.bankStatementLine.deleteMany({
        where: { statementId: { in: statements.map((s) => s.id) } },
      });
      await tx.bankStatement.deleteMany({ where: { buildingId } });
    }

    const journalEntries = await tx.journalEntry.findMany({
      where: { buildingId },
      select: { id: true },
    });
    if (journalEntries.length) {
      await tx.journalLine.deleteMany({
        where: { entryId: { in: journalEntries.map((e) => e.id) } },
      });
      await tx.journalEntry.deleteMany({ where: { buildingId } });
    }

    await tx.ledgerAccount.deleteMany({ where: { buildingId } });

    if (fundIds.length) {
      await tx.fund.deleteMany({ where: { id: { in: fundIds } } });
    }
    await tx.bankAccount.deleteMany({ where: { buildingId } });

    // Soft-scoped operational data
    await tx.request.deleteMany({ where: { buildingId } });
    const meetings = await tx.meeting.findMany({
      where: { buildingId },
      select: { id: true },
    });
    if (meetings.length) {
      const meetingIds = meetings.map((m) => m.id);
      const agenda = await tx.meetingAgendaItem.findMany({
        where: { meetingId: { in: meetingIds } },
        select: { id: true },
      });
      const agendaIds = agenda.map((a) => a.id);
      if (agendaIds.length) {
        await tx.meetingVote.deleteMany({ where: { agendaItemId: { in: agendaIds } } });
        await tx.meetingAgendaItem.deleteMany({ where: { id: { in: agendaIds } } });
      }
      await tx.meetingParticipant.deleteMany({ where: { meetingId: { in: meetingIds } } });
      await tx.meetingSignature.deleteMany({ where: { meetingId: { in: meetingIds } } });
      await tx.meeting.deleteMany({ where: { id: { in: meetingIds } } });
    }
    const threads = await tx.chatThread.findMany({
      where: { buildingId },
      select: { id: true },
    });
    if (threads.length) {
      const threadIds = threads.map((t) => t.id);
      await tx.chatMessage.deleteMany({ where: { threadId: { in: threadIds } } });
      await tx.chatThreadMember.deleteMany({ where: { threadId: { in: threadIds } } });
      await tx.chatThread.deleteMany({ where: { id: { in: threadIds } } });
    }

    await tx.building.delete({ where: { id: buildingId } });
  }

  private async purgeApartments(
    tx: Prisma.TransactionClient,
    apartmentIds: string[],
  ) {
    if (!apartmentIds.length) return;

    const lines = await tx.accrualLine.findMany({
      where: { apartmentId: { in: apartmentIds } },
      select: { id: true },
    });
    const lineIds = lines.map((l) => l.id);
    const payments = await tx.payment.findMany({
      where: { apartmentId: { in: apartmentIds } },
      select: { id: true },
    });
    const paymentIds = payments.map((p) => p.id);

    if (lineIds.length || paymentIds.length) {
      await tx.paymentAllocation.deleteMany({
        where: {
          OR: [
            ...(lineIds.length ? [{ accrualLineId: { in: lineIds } }] : []),
            ...(paymentIds.length ? [{ paymentId: { in: paymentIds } }] : []),
          ],
        },
      });
    }
    if (paymentIds.length) {
      await tx.onlinePaymentOrder.updateMany({
        where: { paymentId: { in: paymentIds } },
        data: { paymentId: null },
      });
      await tx.payment.deleteMany({ where: { id: { in: paymentIds } } });
    }
    await tx.onlinePaymentOrder.deleteMany({
      where: { apartmentId: { in: apartmentIds } },
    });
    if (lineIds.length) {
      await tx.accrualLine.deleteMany({ where: { id: { in: lineIds } } });
    }
    await tx.resident.deleteMany({ where: { apartmentId: { in: apartmentIds } } });
    await tx.user.updateMany({
      where: { apartmentId: { in: apartmentIds } },
      data: { apartmentId: null },
    });
    await tx.userApartment.deleteMany({ where: { apartmentId: { in: apartmentIds } } });
    await tx.apartment.deleteMany({ where: { id: { in: apartmentIds } } });
  }

  private async purgeOrphanUser(tx: Prisma.TransactionClient, userId: string) {
    // Clear author-linked rows that Restrict user delete
    const announcements = await tx.announcement.findMany({
      where: { authorId: userId },
      select: { id: true },
    });
    if (announcements.length) {
      const ids = announcements.map((a) => a.id);
      await tx.announcementRead.deleteMany({ where: { announcementId: { in: ids } } });
      await tx.announcement.deleteMany({ where: { id: { in: ids } } });
    }
    await tx.request.deleteMany({
      where: { OR: [{ authorId: userId }, { assigneeId: userId }] },
    });
    await tx.pollVote.deleteMany({ where: { userId } });
    await tx.reminder.deleteMany({
      where: { OR: [{ userId }, { createdById: userId }] },
    });
    await tx.authSession.deleteMany({ where: { userId } });
    await tx.passwordResetToken.deleteMany({ where: { userId } });
    await tx.appNotification.deleteMany({ where: { userId } });
    await tx.pushSubscription.deleteMany({ where: { userId } });
    await tx.userApartment.deleteMany({ where: { userId } });
    await tx.chatThreadMember.deleteMany({ where: { userId } });
    await tx.chatMessage.deleteMany({ where: { authorId: userId } });
    await tx.meetingParticipant.deleteMany({ where: { userId } });
    await tx.meetingVote.deleteMany({ where: { userId } });
    await tx.meetingSignature.deleteMany({ where: { userId } });
    // AuditLog.user relation defaults to Restrict
    await tx.auditLog.updateMany({
      where: { userId },
      data: { userId: null },
    });
    // SignSession has no FK relation but still references userId
    await tx.signSession.deleteMany({ where: { userId } });

    await tx.user.delete({ where: { id: userId } });
  }
}
