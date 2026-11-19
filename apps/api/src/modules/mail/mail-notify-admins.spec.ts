import { MailService } from './mail.service';

describe('MailService.notifyAdmins (tenant-scoped recipients)', () => {
  const findMany = jest.fn(async () => [{ email: 'a@x', firstName: 'A', lastName: 'B', emailNotifyEnabled: true }]);
  const svc = new MailService({ get: () => undefined } as never, { user: { findMany } } as never);
  const notifyUsers = jest.spyOn(svc, 'notifyUsers').mockResolvedValue(undefined as never);

  beforeEach(() => jest.clearAllMocks());

  it('skips without tenant (no global broadcast)', async () => {
    await svc.notifyAdmins(null, 'registration.new_request', {});
    expect(findMany).not.toHaveBeenCalled();
    expect(notifyUsers).not.toHaveBeenCalled();
  });

  it('filters recipients by active staff membership of the tenant', async () => {
    await svc.notifyAdmins('tA', 'registration.new_request', {});
    const where = (findMany.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0].where;
    expect(where.memberships).toEqual({
      some: { tenantId: 'tA', status: 'active', role: { in: ['chairman', 'accountant', 'board'] } },
    });
    expect(notifyUsers).toHaveBeenCalledTimes(1);
  });
});
