import { readFileSync } from 'fs';
import { join } from 'path';

/** Phase 4: every documented operation has a success response schema (scripts/response-schemas.ts). */
describe('OpenAPI response schemas', () => {
  const doc = JSON.parse(readFileSync(join(__dirname, '../../../docs/api/openapi.json'), 'utf8')) as {
    paths: Record<string, Record<string, { responses?: Record<string, { content?: Record<string, { schema?: unknown }> }> }>>;
  };
  const ops = Object.entries(doc.paths).flatMap(([p, ms]) => Object.entries(ms).map(([m, op]) => ({ id: `${m} ${p}`, op })));

  it('covers all operations', () => {
    const missing = ops.filter(({ op }) => !Object.entries(op.responses ?? {}).some(([c, r]) => /^2/.test(c) && r.content));
    expect(ops.length).toBeGreaterThan(250);
    expect(missing.map((m) => m.id)).toEqual([]);
  });

  it('derives real shapes (login returns tokens, funds have balanceSource)', () => {
    const json = (p: string, m: string) =>
      JSON.stringify(Object.values(doc.paths[p][m].responses ?? {})[0]?.content?.['application/json']?.schema);
    expect(json('/api/auth/login', 'post')).toContain('"accessToken"');
    expect(json('/api/finance/funds', 'get')).toContain('"balanceSource"');
    expect(JSON.stringify(doc)).not.toContain('__@');
  });
});
