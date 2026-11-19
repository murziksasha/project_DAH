import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildPolicy, collectHashes, inlineScripts, nginxSnippet, sha256Source } from './csp-hashes.mjs';

describe('L7: CSP hashes for static export', () => {
  it('extracts only executable inline scripts', () => {
    const html =
      '<script src="/a.js"></script><script>alert(1)</script>' +
      '<script type="application/json">{"x":1}</script><script type="module">m()</script>' +
      '<script async="" src="/b.js"></script>';
    assert.deepEqual(inlineScripts(html), ['alert(1)', 'm()']);
  });

  it('hashes like browsers (sha256 of exact UTF-8 bytes, base64)', () => {
    // echo -n 'alert(1)' | openssl dgst -sha256 -binary | base64
    assert.equal(sha256Source('alert(1)'), "'sha256-bhHHL3z2vDgxUt0W3dWQOrprscmda2Y5pLsLg4GF+pI='");
  });

  it('policy has no unsafe-inline for scripts and dedupes pages', () => {
    const dir = mkdtempSync(join(tmpdir(), 'csp-'));
    mkdirSync(join(dir, 'admin'));
    writeFileSync(join(dir, 'index.html'), '<script>a()</script><script>b()</script>');
    writeFileSync(join(dir, 'admin', 'index.html'), '<script>a()</script>');
    const { pages, hashes } = collectHashes(dir);
    assert.equal(pages.length, 2);
    assert.equal(hashes.length, 2);
    const policy = buildPolicy(hashes);
    const scriptSrc = policy.split('; ').find((d) => d.startsWith('script-src'));
    assert.ok(!scriptSrc.includes('unsafe-inline'));
    assert.ok(scriptSrc.includes(sha256Source('a()')));
    assert.match(nginxSnippet(policy), /^# Generated[\s\S]*add_header Content-Security-Policy ".*" always;\n$/);
  });

  it('generated .csp matches the current build (when out/ exists)', { skip: !existsSync(fileURLToPath(new URL('../out', import.meta.url))) }, () => {
    const root = fileURLToPath(new URL('..', import.meta.url));
    const generated = JSON.parse(readFileSync(join(root, '.csp', 'csp-hashes.json'), 'utf8'));
    const { hashes } = collectHashes(join(root, 'out'));
    assert.deepEqual(generated.hashes, hashes, 'run npm run build -w @dah/web (postbuild regenerates .csp)');
  });
});
