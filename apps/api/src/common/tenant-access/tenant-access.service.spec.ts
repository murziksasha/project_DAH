import { NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthUser } from '../decorators/current-user.decorator';
import { TenantAccessService, assertTenantMatch, effectiveTenantId } from './tenant-access.service';

const buildings = [
  { id: 'bA', tenantId: 'tA', createdAt: new Date(1) },
  { id: 'bB', tenantId: 'tB', createdAt: new Date(2) },
];
const apartments = [
  { id: 'aA', buildingId: 'bA', building: { tenantId: 'tA' } },
  { id: 'aB', buildingId: 'bB', building: { tenantId: 'tB' } },
];
const funds = [
  { id: 'fA', buildingId: 'bA' },
  { id: 'fB', buildingId: 'bB' },
];

const prisma = {
  building: {
    findUnique: jest.fn(async ({ where }) => buildings.find((b) => b.id === where.id) ?? null),
    findFirst: jest.fn(async ({ where }) => buildings.find((b) => !where || b.tenantId === where.tenantId) ?? null),
    findMany: jest.fn(async ({ where }) => buildings.filter((b) => b.tenantId === where.tenantId)),
  },
  apartment: {
    findUnique: jest.fn(async ({ where }) => apartments.find((a) => a.id === where.id) ?? null),
    findMany: jest.fn(async ({ where }) => apartments.filter((a) => where.id.in.includes(a.id))),
  },
  fund: {
    findUnique: jest.fn(async ({ where }) => funds.find((f) => f.id === where.id) ?? null),
    findMany: jest.fn(async ({ where }) => funds.filter((f) => where.id.in.includes(f.id))),
  },
  supplier: { findMany: jest.fn(async () => []) },
  bankAccount: { findMany: jest.fn(async () => []) },
};

const chairA: AuthUser = { id: 'u1', email: 'a', role: UserRole.chairman, tenantId: 'tA' };
const resA: AuthUser = { id: 'u2', email: 'r', role: UserRole.resident, tenantId: 'tA', apartmentIds: [] };
const root: AuthUser = { id: 'u0', email: 's', role: UserRole.super_admin, tenantId: null };

describe('TenantAccessService (C1–C6)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = new TenantAccessService(prisma as any);

  it('effective tenant: users pinned to JWT tenant, super_admin may override', () => {
    expect(effectiveTenantId(chairA)).toBe('tA');
    expect(effectiveTenantId(root)).toBeNull();
    expect(effectiveTenantId(root, 'tB')).toBe('tB');
  });

  it('assertTenantMatch → 404 on mismatch, platform admin unrestricted', () => {
    expect(() => assertTenantMatch(chairA, 'tB')).toThrow(NotFoundException);
    expect(() => assertTenantMatch(chairA, null)).toThrow(NotFoundException);
    expect(() => assertTenantMatch(chairA, 'tA')).not.toThrow();
    expect(() => assertTenantMatch(root, 'tB')).not.toThrow();
  });

  it('assertBuilding / resolveBuilding / scopeBuildingIds', async () => {
    await expect(svc.assertBuilding(chairA, 'bB')).rejects.toThrow(NotFoundException);
    await expect(svc.assertBuilding(chairA, 'missing')).rejects.toThrow(NotFoundException);
    await expect(svc.assertBuilding(chairA, 'bA')).resolves.toMatchObject({ id: 'bA' });
    await expect(svc.resolveBuilding(chairA)).resolves.toBe('bA');
    await expect(svc.scopeBuildingIds(chairA)).resolves.toEqual(['bA']);
    await expect(svc.scopeBuildingIds(root)).resolves.toBeNull();
    await expect(svc.scopeBuildingIds(root, null, 'tB')).resolves.toEqual(['bB']);
  });

  it('assertApartment: foreign tenant and foreign resident apartment → 404', async () => {
    await expect(svc.assertApartment(chairA, 'aB')).rejects.toThrow(NotFoundException);
    await expect(svc.assertApartment(chairA, 'aA')).resolves.toMatchObject({ buildingId: 'bA' });
    await expect(svc.assertApartment(resA, 'aA')).rejects.toThrow(NotFoundException);
    await expect(
      svc.assertApartment({ ...resA, apartmentIds: ['aA'] }, 'aA'),
    ).resolves.toMatchObject({ id: 'aA' });
  });

  it('assertOptionalBuilding: global rows only for platform admin', async () => {
    await expect(svc.assertOptionalBuilding(chairA, null)).rejects.toThrow(NotFoundException);
    await expect(svc.assertOptionalBuilding(root, null)).resolves.toBeUndefined();
  });

  it('assertRefsInBuilding rejects ids from another building', async () => {
    await expect(svc.assertRefsInBuilding('bA', { fundIds: ['fA', null] })).resolves.toBeUndefined();
    await expect(svc.assertRefsInBuilding('bA', { fundIds: ['fB'] })).rejects.toThrow(NotFoundException);
    await expect(svc.assertRefsInBuilding('bA', { apartmentIds: ['aB'] })).rejects.toThrow(NotFoundException);
    await expect(svc.assertRefsInBuilding('bA', { fundIds: ['nope'] })).rejects.toThrow(NotFoundException);
  });
});
