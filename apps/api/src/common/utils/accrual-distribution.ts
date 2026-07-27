import { AccrualDistribution } from '@prisma/client';
import { roundMoney } from './money';

export interface ApartmentInput {
  id: string;
  area: number;
  /** Sum of meter consumption for period (by_meter). */
  meterConsumption?: number;
}

export function calcAccrualLineAmount(
  apt: ApartmentInput,
  distribution: AccrualDistribution,
  rate?: number,
  fixedAmount?: number,
  manualLines?: { apartmentId: string; amount: number }[],
): number {
  switch (distribution) {
    case AccrualDistribution.by_area:
      return roundMoney(apt.area * (rate ?? 0));
    case AccrualDistribution.fixed_per_apartment:
      return roundMoney(fixedAmount ?? 0);
    case AccrualDistribution.manual: {
      const manual = manualLines?.find((l) => l.apartmentId === apt.id);
      return manual ? roundMoney(manual.amount) : 0;
    }
    case AccrualDistribution.by_meter: {
      const c = apt.meterConsumption ?? 0;
      if (c <= 0) return 0;
      return roundMoney(c * (rate ?? 0));
    }
    default:
      return 0;
  }
}

export function validateAccrualDistribution(
  distribution: AccrualDistribution,
  rate?: number,
  fixedAmount?: number,
  manualLines?: { apartmentId: string; amount: number }[],
): string | null {
  if (distribution === AccrualDistribution.by_area && (rate === undefined || rate <= 0)) {
    return 'Для розподілу by_area потрібен тариф rate > 0';
  }
  if (
    distribution === AccrualDistribution.fixed_per_apartment &&
    (!fixedAmount || fixedAmount <= 0)
  ) {
    return 'Для fixed_per_apartment потрібна fixedAmount > 0';
  }
  if (distribution === AccrualDistribution.manual && !manualLines?.length) {
    return 'Для manual потрібні manualLines';
  }
  if (distribution === AccrualDistribution.by_meter && (rate === undefined || rate <= 0)) {
    return 'Для by_meter потрібен тариф rate (грн/од.) > 0';
  }
  return null;
}
