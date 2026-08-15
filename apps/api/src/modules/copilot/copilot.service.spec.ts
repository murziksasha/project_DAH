import { CopilotService } from './copilot.service';

describe('CopilotService', () => {
  const config = { get: () => 'true' };
  const svc = new CopilotService(config as never);

  it('marks flood as urgent', () => {
    const r = svc.classifyRequest({
      title: 'Затоплення в підвалі',
      description: 'Прорвало трубу',
    });
    expect(r.priority).toBe('urgent');
    expect(r.slaHoursHint).toBeLessThanOrEqual(4);
  });

  it('detects electric category', () => {
    const r = svc.classifyRequest({ title: 'Немає світла в щиті' });
    expect(r.category).toBe('electric');
  });

  it('match hint finds apartment', () => {
    const h = svc.suggestPaymentMatch('Оплата кв. 101');
    expect(h.lookForApartment).toBe(true);
  });

  it('draft note includes period', () => {
    const d = svc.draftBoardNote({
      period: '2026-03',
      totalIncome: 1000,
      totalExpenses: 800,
    });
    expect(d.title).toContain('2026-03');
    expect(d.body).toContain('1000');
  });
});
