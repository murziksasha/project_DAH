import {
  extractApartmentNumber,
  matchStatementRows,
  parseAmount,
  parseBankStatementCsv,
  parseDate,
} from './bank-statement-import';

describe('bank-statement-import', () => {
  describe('extractApartmentNumber', () => {
    it('parses Ukrainian purpose lines', () => {
      expect(extractApartmentNumber('Оплата внесків, кв. 101')).toBe('101');
      expect(extractApartmentNumber('квартплата квартира 12А')).toBe('12а');
      expect(extractApartmentNumber('кв 7')).toBe('7');
    });
  });

  describe('parseAmount / parseDate', () => {
    it('parses EU and UA amounts', () => {
      expect(parseAmount('450,50')).toBe(450.5);
      expect(parseAmount('1 250.00')).toBe(1250);
      expect(parseAmount('1.250,75')).toBe(1250.75);
    });

    it('parses dates', () => {
      expect(parseDate('2026-03-01')).toBe('2026-03-01');
      expect(parseDate('01.03.2026')).toBe('2026-03-01');
      expect(parseDate('15/04/2026')).toBe('2026-04-15');
    });
  });

  describe('parseBankStatementCsv', () => {
    it('parses header + semicolon CSV', () => {
      const csv = [
        'Дата;Сума;Призначення',
        '01.03.2026;450,00;Оплата внесків кв. 101',
        '02.03.2026;-100,00;Комісія банку',
        '03.03.2026;200;Переказ без квартири',
      ].join('\n');

      const rows = parseBankStatementCsv(csv);
      expect(rows).toHaveLength(3);
      expect(rows[0].status).toBe('matched');
      expect(rows[0].amount).toBe(450);
      expect(rows[0].extractedApartment).toBe('101');
      expect(rows[1].status).toBe('skipped');
      expect(rows[2].status).toBe('unmatched');
    });
  });

  describe('matchStatementRows', () => {
    it('links apartments by number', () => {
      const parsed = parseBankStatementCsv(
        'date,amount,reference\n2026-03-01,100,кв. 5\n2026-03-02,50,кв. 999',
      );
      const matched = matchStatementRows(parsed, [
        { id: 'a1', number: '5' },
        { id: 'a2', number: '10' },
      ]);
      expect(matched[0].apartmentId).toBe('a1');
      expect(matched[0].status).toBe('matched');
      expect(matched[1].status).toBe('unmatched');
      expect(matched[1].apartmentId).toBeNull();
    });
  });
});
