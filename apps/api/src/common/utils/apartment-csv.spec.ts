import { extractEmailsFromResidentsCell, parseApartmentsCsv } from './apartment-csv';

describe('parseApartmentsCsv', () => {
  it('parses export format with header and residents', () => {
    const csv = [
      "Номер,Під'їзд,Поверх,Площа,Мешканці",
      '1,1,1,49,Марія Шевченко <resident@osbb.local>',
      '2,1,1,36.3,',
      '10,1,3,30.5,',
    ].join('\n');

    const { rows, errors } = parseApartmentsCsv(csv);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.number === '1')).toMatchObject({
      entrance: 1,
      floor: 1,
      area: 49,
      residentsRaw: expect.stringContaining('resident@osbb.local'),
    });
    expect(rows.find((r) => r.number === '10')?.area).toBe(30.5);
  });

  it('dedupes by number (last wins)', () => {
    const { rows } = parseApartmentsCsv('1,1,1,40\n1,1,2,55');
    expect(rows).toHaveLength(1);
    expect(rows[0].area).toBe(55);
    expect(rows[0].floor).toBe(2);
  });
});

describe('extractEmailsFromResidentsCell', () => {
  it('pulls emails from angle brackets and bare', () => {
    expect(
      extractEmailsFromResidentsCell('Марія <resident@osbb.local>; other@x.com'),
    ).toEqual(['resident@osbb.local', 'other@x.com']);
  });
});
