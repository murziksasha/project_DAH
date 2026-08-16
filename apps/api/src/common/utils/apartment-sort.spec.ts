import { compareApartmentNumbers, sortByApartmentNumber } from './apartment-sort';

describe('compareApartmentNumbers', () => {
  it('orders pure numbers numerically', () => {
    const nums = ['10', '2', '1', '101', '11', '88'];
    expect([...nums].sort(compareApartmentNumbers)).toEqual(['1', '2', '10', '11', '88', '101']);
  });

  it('handles mixed labels', () => {
    expect(compareApartmentNumbers('12А', '12Б')).toBeLessThan(0);
    expect(compareApartmentNumbers('2', '12А')).toBeLessThan(0);
  });
});

describe('sortByApartmentNumber', () => {
  it('sorts by entrance then number', () => {
    const rows = [
      { number: '10', entrance: 1 },
      { number: '2', entrance: 2 },
      { number: '1', entrance: 1 },
    ];
    expect(sortByApartmentNumber(rows).map((r) => `${r.entrance}-${r.number}`)).toEqual([
      '1-1',
      '1-10',
      '2-2',
    ]);
  });
});
