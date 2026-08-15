import { defaultCashFlowSource, financeFlags, isJournalSotEnabled } from './finance-sot';

describe('finance-sot', () => {
  it('defaults off without settings', () => {
    expect(isJournalSotEnabled({}, {})).toBe(false);
    expect(isJournalSotEnabled(null, {})).toBe(false);
  });

  it('respects building finance.journalSot', () => {
    expect(
      isJournalSotEnabled({ finance: { journalSot: true } }, {}),
    ).toBe(true);
  });

  it('env true overrides settings false', () => {
    expect(
      isJournalSotEnabled({ finance: { journalSot: false } }, { JOURNAL_SOT: 'true' }),
    ).toBe(true);
  });

  it('env false overrides settings true', () => {
    expect(
      isJournalSotEnabled({ finance: { journalSot: true } }, { JOURNAL_SOT: '0' }),
    ).toBe(false);
  });

  it('defaultCashFlowSource follows SOT', () => {
    expect(defaultCashFlowSource({ finance: { journalSot: true } }, {})).toBe(
      'journal',
    );
    expect(
      defaultCashFlowSource(
        { finance: { journalSot: false, defaultCashFlowSource: 'both' } },
        {},
      ),
    ).toBe('both');
  });

  it('financeFlags packages values', () => {
    const f = financeFlags(
      { finance: { journalSot: true, strictBankRec: true } },
      {},
    );
    expect(f.journalSot).toBe(true);
    expect(f.strictBankRec).toBe(true);
    expect(f.envOverride).toBe(false);
  });
});
