/**
 * L2/L9: export the OpenAPI spec without a database (Nest "preview" mode: providers are
 * not instantiated, only module/controller metadata is read).
 *
 *   npm run openapi:export -w @dah/api           → docs/api/openapi.json + docs/api/API-REFERENCE.md
 *   npm run openapi:check -w @dah/api            → fails if the committed files are stale
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { AppModule } from '../src/app.module';
import { buildOpenApiDocument } from '../src/openapi';
import {
  effectiveMatrix,
  renderApiReference,
  renderRbacMatrix,
  RbacRow,
  stableOpenApi,
} from '../src/openapi-reference';
import { UserRole } from '@prisma/client';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { ROLE_PERMISSIONS } from '@dah/shared';
import { ROLES_KEY } from '../src/common/decorators/roles.decorator';
import { PERMISSIONS_KEY } from '../src/common/decorators/permissions.decorator';

type Ctor = new (...args: never[]) => unknown;

const ALL_ROLES = Object.values(UserRole) as string[];

function collectRbac(app: unknown): RbacRow[] {
  const container = (app as { container: { getModules(): Map<string, { controllers: Map<unknown, { metatype: Ctor }> }> } }).container;
  const rows: RbacRow[] = [];
  const join = (...parts: string[]) =>
    '/' + parts.flatMap((p) => p.split('/')).filter(Boolean).join('/');
  for (const mod of container.getModules().values()) {
    for (const wrapper of mod.controllers.values()) {
      const ctrl = wrapper.metatype;
      const base = ([] as string[]).concat(Reflect.getMetadata(PATH_METADATA, ctrl) ?? '')[0] ?? '';
      const proto = ctrl.prototype as Record<string, unknown>;
      for (const name of Object.getOwnPropertyNames(proto)) {
        const fn = proto[name];
        if (name === 'constructor' || typeof fn !== 'function') continue;
        const method = Reflect.getMetadata(METHOD_METADATA, fn);
        if (method === undefined) continue;
        const subs = ([] as string[]).concat(Reflect.getMetadata(PATH_METADATA, fn) ?? '');
        // passport AuthGuard('jwt') is a mixin with a random class name → detect by handleRequest
        const guards = [
          ...((Reflect.getMetadata(GUARDS_METADATA, ctrl) as Array<{ name?: string; prototype?: object }>) ?? []),
          ...((Reflect.getMetadata(GUARDS_METADATA, fn) as Array<{ name?: string; prototype?: object }>) ?? []),
        ].map((g) =>
          g?.prototype && 'handleRequest' in g.prototype ? 'JwtAuthGuard' : (g?.name ?? ''),
        );
        const roles = (Reflect.getMetadata(ROLES_KEY, fn) ?? Reflect.getMetadata(ROLES_KEY, ctrl) ?? []) as string[];
        const permissions = (Reflect.getMetadata(PERMISSIONS_KEY, fn) ?? Reflect.getMetadata(PERMISSIONS_KEY, ctrl) ?? []) as string[];
        const auth: RbacRow['auth'] = guards.some((g) => /jwt/i.test(g)) ? 'jwt' : guards.length ? 'other' : 'public';
        for (const sub of subs) {
          rows.push({
            method: RequestMethod[method as number] ?? String(method),
            route: join('api', base, sub),
            controller: ctrl.name,
            handler: name,
            auth,
            roles: [...roles].sort(),
            permissions: [...permissions].sort(),
            rolesGuard: guards.includes('RolesGuard'),
            permissionsGuard: guards.includes('PermissionsGuard'),
          });
        }
      }
    }
  }
  return rows;
}

async function main() {
  process.env.SWAGGER_ENABLED = 'true';
  const app = await NestFactory.create(AppModule, { preview: true, logger: false, abortOnError: false });
  app.setGlobalPrefix('api');
  const doc = stableOpenApi(buildOpenApiDocument(app));
  const rbac = collectRbac(app);
  if (process.env.RBAC_DUMP) writeFileSync(process.env.RBAC_DUMP, JSON.stringify(rbac, null, 2));
  const outDir = resolve(__dirname, '../../../docs/api');
  const files: Record<string, string> = {
    'openapi.json': JSON.stringify(doc, null, 2) + '\n',
    'API-REFERENCE.md': renderApiReference(doc),
    'RBAC-MATRIX.md': renderRbacMatrix(rbac, ROLE_PERMISSIONS, ALL_ROLES),
    'rbac-effective.json': JSON.stringify(effectiveMatrix(rbac, ROLE_PERMISSIONS, ALL_ROLES), null, 2) + '\n',
  };
  const check = process.argv.includes('--check');
  let stale = false;
  for (const [name, content] of Object.entries(files)) {
    const p = join(outDir, name);
    const current = existsSync(p) ? readFileSync(p, 'utf8').replace(/\r\n/g, '\n') : null;
    if (check) {
      if (current !== content) {
        stale = true;
        console.error(`stale: docs/api/${name} — run npm run openapi:export -w @dah/api`);
      }
    } else {
      mkdirSync(outDir, { recursive: true });
      writeFileSync(p, content);
      console.log(`written docs/api/${name}`);
    }
  }
  await app.close().catch(() => undefined);
  process.exit(stale ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
