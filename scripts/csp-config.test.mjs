import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('L7: edge nginx no longer sends a script-src with unsafe-inline', () => {
  for (const f of ['infra/nginx/nginx.conf', 'infra/nginx/nginx-ssl.conf', 'infra/nginx/nginx-selfhost.conf']) {
    const conf = read(f);
    assert.doesNotMatch(conf, /script-src[^;"]*'unsafe-inline'/, f);
    assert.match(conf, /proxy_buffer_size\s+32k;/, `${f}: buffers for the ~8 KB hashed CSP header`);
  }
});

test('L7: web image and native nginx include the generated hashed CSP', () => {
  assert.match(read('apps/web/package.json'), /"postbuild":\s*"node scripts\/csp-hashes\.mjs"/);
  assert.match(read('apps/web/nginx.conf'), /location \/ \{[^}]*include \/etc\/nginx\/dah-csp\/\*\.conf;/);
  assert.match(read('apps/web/Dockerfile'), /COPY --from=builder \/app\/apps\/web\/\.csp\/nginx-csp\.conf \/etc\/nginx\/dah-csp\//);
  for (const f of ['infra/nginx/dah-native.conf.in', 'infra/nginx/dah-windows.conf.in']) {
    assert.match(read(f), /location \/ \{[^}]*include @@DAH_ROOT@@\/apps\/web\/\.csp\/\*\.conf;/, f);
  }
});
