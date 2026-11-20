import { scopeArgs } from './tenant-scope.extension';

describe('tenant scope extension (Phase 2.1)', () => {
  it('no tenant / unscoped model → args untouched', () => {
    const args = { where: { id: '1' } };
    expect(scopeArgs('Building', 'findMany', args, null)).toBe(args);
    expect(scopeArgs('User', 'findMany', args, 't1')).toBe(args);
  });

  it('list / bulk operations get AND tenantId', () => {
    expect(scopeArgs('Reminder', 'findMany', { where: { sentAt: null } }, 't1').where).toEqual({
      AND: [{ sentAt: null }, { tenantId: 't1' }],
    });
    expect(scopeArgs('Meeting', 'deleteMany', {}, 't1').where).toEqual({ AND: [{}, { tenantId: 't1' }] });
  });

  it('unique operations keep the unique key and add tenantId', () => {
    expect(scopeArgs('Document', 'findUnique', { where: { id: 'd' } }, 't1').where).toEqual({
      id: 'd',
      tenantId: 't1',
    });
    expect(scopeArgs('Poll', 'update', { where: { id: 'p' }, data: {} }, 't1').where).toEqual({
      id: 'p',
      tenantId: 't1',
    });
  });

  it('create fills tenantId unless set explicitly', () => {
    expect(scopeArgs('Reminder', 'create', { data: { title: 'x' } }, 't1').data).toEqual({
      title: 'x',
      tenantId: 't1',
    });
    expect(scopeArgs('Building', 'create', { data: { tenantId: 't2' } }, 't1').data).toEqual({
      tenantId: 't2',
    });
    expect(
      scopeArgs('Announcement', 'createMany', { data: [{ a: 1 }, { a: 2, tenantId: 't3' }] }, 't1').data,
    ).toEqual([{ a: 1, tenantId: 't1' }, { a: 2, tenantId: 't3' }]);
  });
});
