import { AccrualDistribution } from '@prisma/client';
import { calcAccrualLineAmount, validateAccrualDistribution } from './accrual-distribution';

describe('calcAccrualLineAmount', () => {
  const apt = { id: 'apt-1', area: 50 };

  it('calculates by_area', () => {
    expect(
      calcAccrualLineAmount(apt, AccrualDistribution.by_area, 8.5),
    ).toBe(425);
  });

  it('calculates fixed_per_apartment', () => {
    expect(
      calcAccrualLineAmount(apt, AccrualDistribution.fixed_per_apartment, undefined, 300),
    ).toBe(300);
  });

  it('calculates manual amount for matching apartment', () => {
    expect(
      calcAccrualLineAmount(apt, AccrualDistribution.manual, undefined, undefined, [
        { apartmentId: 'apt-1', amount: 150 },
      ]),
    ).toBe(150);
  });

  it('calculates by_meter from consumption * rate', () => {
    expect(
      calcAccrualLineAmount(
        { ...apt, meterConsumption: 12.5 },
        AccrualDistribution.by_meter,
        20,
      ),
    ).toBe(250);
  });
});

describe('validateAccrualDistribution', () => {
  it('requires rate for by_area', () => {
    expect(validateAccrualDistribution(AccrualDistribution.by_area)).toContain('by_area');
  });

  it('requires fixedAmount for fixed_per_apartment', () => {
    expect(
      validateAccrualDistribution(AccrualDistribution.fixed_per_apartment),
    ).toContain('fixed_per_apartment');
  });

  it('returns null for valid manual distribution', () => {
    expect(
      validateAccrualDistribution(AccrualDistribution.manual, undefined, undefined, [
        { apartmentId: 'a', amount: 1 },
      ]),
    ).toBeNull();
  });

  it('requires rate for by_meter', () => {
    expect(validateAccrualDistribution(AccrualDistribution.by_meter)).toContain('by_meter');
  });
});