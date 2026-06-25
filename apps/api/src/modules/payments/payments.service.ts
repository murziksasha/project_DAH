import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccrualLineStatus,
  PaymentSource,
  Prisma,
} from '@prisma/client';
import {
  FifoLineInput,
  planFifoAllocation,
  resolveAccrualLineStatus,
} from '../../common/utils/fifo-allocation';
import { roundMoney } from '../../common/utils/money';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreatePaymentDto } from './dto/create-payment.dto';

export interface AllocationPlan {
  accrualLineId: string;
  amount: number;
  period: string;
  title: string;
  lineBalance: number;
}

@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  listPayments(apartmentId?: string) {
    const where: Prisma.PaymentWhereInput = { isVoided: false };
    if (apartmentId) where.apartmentId = apartmentId;

    return this.prisma.payment.findMany({
      where,
      include: {
        apartment: true,
        allocations: {
          include: {
            accrualLine: { include: { accrual: true } },
          },
        },
      },
      orderBy: { date: 'desc' },
    });
  }

  getPayment(id: string) {
    return this.prisma.payment.findUnique({
      where: { id },
      include: {
        apartment: true,
        allocations: {
          include: {
            accrualLine: { include: { accrual: true } },
          },
        },
      },
    });
  }

  async previewAllocation(apartmentId: string, amount: number) {
    const apartment = await this.prisma.apartment.findUnique({
      where: { id: apartmentId },
    });
    if (!apartment) throw new NotFoundException('Квартиру не знайдено');

    const { allocations, advance } = await this.planAllocation(apartmentId, amount);

    return {
      apartment: { id: apartment.id, number: apartment.number },
      amount,
      allocations,
      advance,
      totalAllocated: roundMoney(allocations.reduce((s, a) => s + a.amount, 0)),
    };
  }

  async createPayment(dto: CreatePaymentDto, userId: string) {
    const apartment = await this.prisma.apartment.findUnique({
      where: { id: dto.apartmentId },
    });
    if (!apartment) throw new NotFoundException('Квартиру не знайдено');

    const { allocations, openLines } = await this.planAllocation(
      dto.apartmentId,
      dto.amount,
      true,
    );

    const payment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.payment.create({
        data: {
          apartmentId: dto.apartmentId,
          amount: dto.amount,
          date: new Date(dto.date),
          source: dto.source,
          reference: dto.reference,
        },
      });

      for (const alloc of allocations) {
        await tx.paymentAllocation.create({
          data: {
            paymentId: created.id,
            accrualLineId: alloc.accrualLineId,
            amount: alloc.amount,
          },
        });

        const line = openLines.find((l) => l.id === alloc.accrualLineId)!;
        const newPaid = roundMoney(Number(line.paidAmount) + alloc.amount);
        const lineAmount = Number(line.amount);
        await tx.accrualLine.update({
          where: { id: line.id },
          data: {
            paidAmount: newPaid,
            status: resolveAccrualLineStatus(lineAmount, newPaid, line.dueDate),
          },
        });
      }

      return created;
    });

    await this.audit.log({
      userId,
      action: 'payment.created',
      entityType: 'Payment',
      entityId: payment.id,
      payload: {
        apartmentId: dto.apartmentId,
        amount: dto.amount,
        allocationsCount: allocations.length,
      },
    });

    return this.getPayment(payment.id);
  }

  async voidPayment(id: string, reason: string, userId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: { allocations: { include: { accrualLine: true } } },
    });
    if (!payment) throw new NotFoundException('Платіж не знайдено');
    if (payment.isVoided) throw new BadRequestException('Платіж вже анульовано');

    await this.prisma.$transaction(async (tx) => {
      for (const alloc of payment.allocations) {
        const line = alloc.accrualLine;
        const newPaid = roundMoney(Number(line.paidAmount) - Number(alloc.amount));
        const lineAmount = Number(line.amount);
        await tx.accrualLine.update({
          where: { id: line.id },
          data: {
            paidAmount: Math.max(0, newPaid),
            status: resolveAccrualLineStatus(lineAmount, Math.max(0, newPaid), line.dueDate),
          },
        });
      }

      await tx.payment.update({
        where: { id },
        data: { isVoided: true, voidReason: reason },
      });
    });

    await this.audit.log({
      userId,
      action: 'payment.voided',
      entityType: 'Payment',
      entityId: id,
      payload: { reason },
    });

    return { id, isVoided: true };
  }

  async getDebtorsReport() {
    const lines = await this.prisma.accrualLine.findMany({
      where: {
        status: { in: [AccrualLineStatus.open, AccrualLineStatus.partially_paid, AccrualLineStatus.overdue] },
      },
      include: {
        apartment: { include: { residents: true, users: { where: { status: 'active' } } } },
        accrual: true,
      },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
    });

    const byApartment = new Map<
      string,
      {
        apartmentId: string;
        number: string;
        entrance: number;
        debt: number;
        oldestDue: Date | null;
        lines: number;
      }
    >();

    for (const line of lines) {
      const balance = roundMoney(Number(line.amount) - Number(line.paidAmount));
      if (balance <= 0) continue;

      const key = line.apartmentId;
      const existing = byApartment.get(key) ?? {
        apartmentId: line.apartmentId,
        number: line.apartment.number,
        entrance: line.apartment.entrance,
        debt: 0,
        oldestDue: null,
        lines: 0,
      };
      existing.debt = roundMoney(existing.debt + balance);
      existing.lines += 1;
      if (line.dueDate && (!existing.oldestDue || line.dueDate < existing.oldestDue)) {
        existing.oldestDue = line.dueDate;
      }
      byApartment.set(key, existing);
    }

    return Array.from(byApartment.values())
      .sort((a, b) => b.debt - a.debt)
      .map((row) => ({
        ...row,
        isOverdue: row.oldestDue ? row.oldestDue < new Date() : false,
      }));
  }

  private async planAllocation(
    apartmentId: string,
    paymentAmount: number,
    loadLines = false,
  ) {
    const openLines = await this.prisma.accrualLine.findMany({
      where: {
        apartmentId,
        status: {
          in: [
            AccrualLineStatus.open,
            AccrualLineStatus.partially_paid,
            AccrualLineStatus.overdue,
          ],
        },
      },
      include: { accrual: true },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
    });

    const fifoLines: FifoLineInput[] = openLines.map((line) => ({
      id: line.id,
      amount: Number(line.amount),
      paidAmount: Number(line.paidAmount),
      dueDate: line.dueDate,
      period: line.accrual.period,
      title: line.accrual.title,
    }));

    const { allocations, advance } = planFifoAllocation(fifoLines, paymentAmount);

    return {
      allocations,
      advance,
      openLines: loadLines ? openLines : [],
    };
  }
}