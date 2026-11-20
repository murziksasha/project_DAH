import type { OpenAPIObject } from '@nestjs/swagger';

const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

/** Version-independent, deterministic spec for committing (no build version churn). */
export function stableOpenApi(doc: OpenAPIObject): OpenAPIObject {
  const paths = Object.fromEntries(Object.keys(doc.paths).sort().map((k) => [k, doc.paths[k]]));
  return { ...doc, info: { ...doc.info, version: 'see package.json' }, paths };
}

/** L9: Markdown endpoint reference generated from OpenAPI (grouped by tag). */
export function renderApiReference(doc: OpenAPIObject): string {
  const groups = new Map<string, string[]>();
  let total = 0;
  for (const [route, item] of Object.entries(doc.paths)) {
    for (const m of METHODS) {
      const op = (item as Record<string, unknown>)[m] as
        | { tags?: string[]; summary?: string; security?: unknown[] }
        | undefined;
      if (!op) continue;
      total += 1;
      const tag = op.tags?.[0] ?? 'other';
      const auth = op.security?.length ? '🔒' : '';
      const line = `| \`${m.toUpperCase()}\` | \`${route}\` | ${auth} | ${(op.summary ?? '').replace(/\|/g, '\\|')} |`;
      groups.set(tag, [...(groups.get(tag) ?? []), line]);
    }
  }
  const out: string[] = [
    '# «Мій дім» — API reference',
    '',
    '> Згенеровано з OpenAPI (`npm run openapi:export -w @dah/api`). Не редагуйте вручну.',
    '> Машиночитна специфікація: [`openapi.json`](./openapi.json). 🔒 — потрібен Bearer JWT.',
    '',
    `Усього endpoints: **${total}**.`,
    '',
  ];
  for (const tag of [...groups.keys()].sort()) {
    out.push(`## ${tag}`, '', '| Метод | Шлях | Auth | Опис |', '|---|---|---|---|', ...groups.get(tag)!, '');
  }
  return out.join('\n');
}

export interface RbacRow {
  method: string;
  route: string;
  controller: string;
  handler: string;
  auth: 'jwt' | 'public' | 'other';
  roles: string[];
  permissions: string[];
  /** Guards actually applied (metadata without its guard is not enforced). */
  rolesGuard?: boolean;
  permissionsGuard?: boolean;
}

/** All roles that pass the guards of an endpoint (RolesGuard AND PermissionsGuard). */
export function effectiveRoles(
  r: RbacRow,
  rolePermissions: Record<string, readonly string[]>,
  allRoles: readonly string[],
): string[] {
  if (r.auth === 'public') return ['*public*'];
  return allRoles
    .filter((role) => {
      const rolesOk = !(r.rolesGuard ?? true) || !r.roles.length || r.roles.includes(role);
      const permsOk =
        !(r.permissionsGuard ?? true) ||
        !r.permissions.length ||
        r.permissions.some((p) => (rolePermissions[role] ?? []).includes(p));
      return rolesOk && permsOk;
    })
    .sort();
}

/** Stable map `METHOD route` → effective roles, committed for before/after diffs. */
export function effectiveMatrix(
  rows: RbacRow[],
  rolePermissions: Record<string, readonly string[]>,
  allRoles: readonly string[],
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const r of [...rows].sort((a, b) => a.route.localeCompare(b.route) || a.method.localeCompare(b.method))) {
    out[`${r.method} ${r.route}`] = effectiveRoles(r, rolePermissions, allRoles);
  }
  return out;
}

/**
 * M15: effective access matrix from decorator metadata (@Roles, @RequirePermissions,
 * @UseGuards). One reviewable artefact instead of 150+ scattered role lists.
 */
export function renderRbacMatrix(
  rows: RbacRow[],
  rolePermissions: Record<string, readonly string[]>,
  allRoles: readonly string[] = Object.keys(rolePermissions),
): string {
  const sorted = [...rows].sort((a, b) => a.route.localeCompare(b.route) || a.method.localeCompare(b.method));
  const allowedByPerms = (perms: string[]) =>
    Object.entries(rolePermissions)
      .filter(([, list]) => perms.some((p) => list.includes(p)))
      .map(([role]) => role)
      .sort();
  const drift: string[] = [];
  const authOnly: string[] = [];
  const lines = sorted.map((r) => {
    const permRoles = r.permissions.length ? allowedByPerms(r.permissions) : [];
    if (r.roles.length && r.permissions.length && (r.rolesGuard ?? true) && (r.permissionsGuard ?? true)) {
      const extra = permRoles.filter((x) => !r.roles.includes(x));
      if (extra.length) {
        drift.push(`| \`${r.method}\` | \`${r.route}\` | @Roles без: ${extra.join(', ')} |`);
      }
    }
    if (r.auth === 'jwt' && !r.roles.length && !r.permissions.length) {
      authOnly.push(`| \`${r.method}\` | \`${r.route}\` | ${r.controller}.${r.handler} |`);
    }
    const eff = effectiveRoles(r, rolePermissions, allRoles);
    return `| \`${r.method}\` | \`${r.route}\` | ${r.auth} | ${r.roles.join(', ') || '—'} | ${r.permissions.join(', ') || '—'} | ${eff.join(', ')} |`;
  });
  return [
    '# «Мій дім» — RBAC matrix',
    '',
    '> Згенеровано з метаданих контролерів (`npm run openapi:export -w @dah/api`). Не редагуйте вручну.',
    '> `jwt` без ролей/permissions = будь-який автентифікований користувач (обмеження — у сервісі/tenant-scope).',
    '',
    `Endpoints: **${rows.length}**; лише JWT: **${authOnly.length}**; розбіжностей Roles↔Permissions: **${drift.length}**.`,
    '',
    '## Розбіжності @Roles ↔ @RequirePermissions (@dah/shared)',
    '',
    'Ролі, яким permission дозволяє доступ, але @Roles на endpoint їх не містить (діє суворіше з двох).',
    '',
    ...(drift.length ? ['| Метод | Шлях | Деталі |', '|---|---|---|', ...drift] : ['Немає.']),
    '',
    '## Лише JWT (без @Roles/@RequirePermissions)',
    '',
    'Доступні будь-якій автентифікованій ролі; доступ обмежує сервіс (власник/квартира/tenant-scope).',
    '',
    ...(authOnly.length ? ['| Метод | Шлях | Handler |', '|---|---|---|', ...authOnly] : ['Немає.']),
    '',
    '## Повна матриця',
    '',
    '| Метод | Шлях | Auth | @Roles | @RequirePermissions | Ефективно (хто проходить guard-и) |',
    '|---|---|---|---|---|---|',
    ...lines,
    '',
  ].join('\n');
}
