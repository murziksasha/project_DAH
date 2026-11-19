import { JournalService } from './journal.service';

describe('JournalService.sotSwitchDecision (Phase 3)', () => {
  const d = JournalService.sotSwitchDecision;
  it('disabling / no-op is always allowed (rollback)', () => {
    expect(d({ enable: false, current: true, eligible: false }).allowed).toBe(true);
    expect(d({ enable: true, current: true, eligible: false }).allowed).toBe(true);
  });
  it('enabling needs the streak', () => {
    expect(d({ enable: true, current: false, eligible: false }).allowed).toBe(false);
    expect(d({ enable: true, current: false, eligible: true })).toEqual({ allowed: true, forced: false });
  });
  it('force: super_admin with a reason only', () => {
    expect(d({ enable: true, current: false, eligible: false, force: true, actorRole: 'chairman', reason: 'long enough reason' }).allowed).toBe(false);
    expect(d({ enable: true, current: false, eligible: false, force: true, actorRole: 'super_admin' }).allowed).toBe(false);
    expect(d({ enable: true, current: false, eligible: false, force: true, actorRole: 'super_admin', reason: 'audited migration' })).toEqual({ allowed: true, forced: true });
  });
});
