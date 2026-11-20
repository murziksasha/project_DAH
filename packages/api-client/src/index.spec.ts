import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { apiPath, type ApiMethod, type ApiPath } from './index';

describe('api-client generated from OpenAPI (L2/L9)', () => {
  it('knows documented routes at compile time', () => {
    const p: ApiPath = apiPath('/api/health/ready');
    const m: ApiMethod<'/api/health/ready'> = 'get';
    assert.equal(p, '/api/health/ready');
    assert.equal(m, 'get');
    // @ts-expect-error unknown route must not compile
    apiPath('/api/does-not-exist');
  });

  it('generated types match the committed OpenAPI spec', () => {
    const spec = JSON.parse(readFileSync(join(__dirname, '../../../docs/api/openapi.json'), 'utf8'));
    const generated = readFileSync(join(__dirname, 'openapi.ts'), 'utf8');
    for (const route of Object.keys(spec.paths)) {
      assert.ok(generated.includes(`"${route}": {`), `missing ${route} — run npm run codegen -w @dah/api-client`);
    }
  });
});
