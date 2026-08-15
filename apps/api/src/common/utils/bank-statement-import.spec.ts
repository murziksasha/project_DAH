import {
  detectStatementFormat,
  extractApartmentNumber,
  matchStatementRows,
  parseAmount,
  parseBankStatement,
  parseBankStatementCsv,
  parseDate,
  parseMt940,
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

  describe('format adapters', () => {
    it('detects mt940', () => {
      const text = ':20:START\n:25:UA123\n:61:2603010301C450,00NTRF\n:86:Оплата кв. 101\n';
      expect(detectStatementFormat(text)).toBe('mt940');
    });

    it('parses MT940 credit lines', () => {
      const text = [
        ':20:REF',
        ':25:UA000000000000000000000000000',
        ':61:2603010301C450,00NTRFNONREF',
        ':86:Оплата внесків кв. 101',
        ':61:2603020302D100,00NTRF',
        ':86:Комісія',
      ].join('\n');
      const rows = parseMt940(text);
      expect(rows.length).toBeGreaterThanOrEqual(2);
      expect(rows[0].status).toBe('matched');
      expect(rows[0].amount).toBe(450);
      expect(rows[0].extractedApartment).toBe('101');
      expect(rows[1].status).toBe('skipped');
    });

    it('parseBankStatement returns format metadata', () => {
      const r = parseBankStatement('Дата;Сума;Призначення\n01.03.2026;10;кв. 1', {
        format: 'auto',
      });
      expect(r.format).toBe('generic_csv');
      expect(r.rows).toHaveLength(1);
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

    it('matches by resident IBAN and full name', () => {
      const iban = 'UA123456789012345678901234567';
      const byIban = matchStatementRows(
        [
          {
            line: 1,
            raw: '',
            date: '2026-03-01',
            amount: 100,
            reference: 'Оплата без квартири',
            counterpartyIban: iban,
            extractedApartment: null,
            status: 'unmatched',
          },
        ],
        {
          apartments: [{ id: 'a1', number: '7' }],
          residents: [
            {
              apartmentId: 'a1',
              apartmentNumber: '7',
              firstName: 'Іван',
              lastName: 'Петренко',
              iban,
            },
          ],
        },
      );
      expect(byIban[0].status).toBe('matched');
      expect(byIban[0].apartmentId).toBe('a1');
      expect(byIban[0].confidence).toBeGreaterThanOrEqual(0.9);
      expect(byIban[0].matchMethod).toBe('iban');
      expect(byIban[0].message).toMatch(/IBAN/i);

      // Name-only is below auto-threshold → unmatched with candidates for review
      const byName = matchStatementRows(
        [
          {
            line: 1,
            raw: '',
            date: '2026-03-01',
            amount: 50,
            reference: 'Платіж Петренко Іван за послуги',
            extractedApartment: null,
            status: 'unmatched',
          },
        ],
        {
          apartments: [{ id: 'a1', number: '7' }],
          residents: [
            {
              apartmentId: 'a1',
              apartmentNumber: '7',
              firstName: 'Іван',
              lastName: 'Петренко',
              iban: null,
            },
          ],
        },
      );
      expect(byName[0].status).toBe('unmatched');
      expect(byName[0].candidates?.[0]?.method).toBe('name');
      expect(byName[0].message).toMatch(/впевненість|ПІБ/i);
    });

    it('matches learned IBAN alias', () => {
      const iban = 'UA999999999999999999999999999';
      const rows = matchStatementRows(
        [
          {
            line: 1,
            raw: '',
            date: '2026-03-01',
            amount: 10,
            reference: 'Оплата',
            counterpartyIban: iban,
            extractedApartment: null,
            status: 'unmatched',
          },
        ],
        {
          apartments: [{ id: 'a1', number: '3' }],
          ibanAliases: [{ iban, apartmentId: 'a1', apartmentNumber: '3' }],
        },
      );
      expect(rows[0].status).toBe('matched');
      expect(rows[0].matchMethod).toBe('iban_alias');
    });
  });

  describe('golden bank fixtures', () => {
    it('privatbank-like CSV', () => {
      const csv = [
        'Дата операції;Сума;Призначення платежу;Рахунок контрагента',
        '15.04.2026;1250,00;Оплата кв. 12;UA213223130000026007233566001',
      ].join('\n');
      const r = parseBankStatement(csv, { format: 'privatbank' });
      expect(r.rows).toHaveLength(1);
      expect(r.rows[0].amount).toBe(1250);
      expect(r.rows[0].extractedApartment).toBe('12');
    });

    it('monobank-like CSV', () => {
      const csv = [
        'Date;Amount;Description',
        '2026-04-15;99.50;Оплата за послуги квартира 7А',
      ].join('\n');
      const r = parseBankStatement(csv, { format: 'monobank' });
      expect(r.rows[0].amount).toBe(99.5);
      expect(r.rows[0].extractedApartment).toBe('7а');
    });
  });
});
