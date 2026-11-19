import { effectiveRoles, renderApiReference, renderRbacMatrix, stableOpenApi } from './openapi-reference';

describe('OpenAPI reference / RBAC matrix (L9, M15)', () => {
  it('renders sorted, version-independent reference', () => {
    const doc = stableOpenApi({
      openapi: '3.0.0',
      info: { title: 't', version: '9.9.9' },
      paths: {
        '/api/b': { get: { tags: ['b'], summary: 'B', security: [{ bearer: [] }], responses: {} } },
        '/api/a': { post: { tags: ['a'], summary: 'A|x', responses: {} } },
      },
    } as never);
    expect(Object.keys(doc.paths)).toEqual(['/api/a', '/api/b']);
    expect(doc.info.version).toBe('see package.json');
    const md = renderApiReference(doc);
    expect(md).toContain('Усього endpoints: **2**');
    expect(md).toContain('| `GET` | `/api/b` | 🔒 | B |');
    expect(md).toContain('A\\|x');
  });

  it('reports Roles↔Permissions drift and JWT-only endpoints', () => {
    const md = renderRbacMatrix(
      [
        { method: 'POST', route: '/api/x', controller: 'C', handler: 'h', auth: 'jwt', roles: ['chairman'], permissions: ['manage_finance'] },
        { method: 'GET', route: '/api/y', controller: 'C', handler: 'y', auth: 'jwt', roles: [], permissions: [] },
      ],
      { chairman: ['manage_finance'], board: ['manage_finance'], resident: [] },
    );
    expect(md).toContain('розбіжностей Roles↔Permissions: **1**');
    expect(md).toContain('@Roles без: board');
    expect(md).toContain('| `GET` | `/api/y` | C.y |');
  });

  it('effective roles = RolesGuard AND PermissionsGuard (metadata without guard is ignored)', () => {
    const rp = { chairman: ['manage_finance'], board: ['manage_finance'], resident: [] };
    const all = ['board', 'chairman', 'resident'];
    const base = { method: 'GET', route: '/x', controller: 'C', handler: 'h', auth: 'jwt' as const };
    expect(effectiveRoles({ ...base, roles: ['chairman'], permissions: ['manage_finance'], rolesGuard: true, permissionsGuard: true }, rp, all)).toEqual(['chairman']);
    expect(effectiveRoles({ ...base, roles: [], permissions: ['manage_finance'], rolesGuard: false, permissionsGuard: true }, rp, all)).toEqual(['board', 'chairman']);
    expect(effectiveRoles({ ...base, roles: [], permissions: ['manage_finance'], rolesGuard: false, permissionsGuard: false }, rp, all)).toEqual(all);
    expect(effectiveRoles({ ...base, auth: 'public', roles: [], permissions: [] }, rp, all)).toEqual(['*public*']);
  });
});
