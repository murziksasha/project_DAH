#!/usr/bin/env node
/**
 * L7 end-to-end: serve out/ with the generated CSP and load pages in headless Chrome;
 * fails on any CSP violation (e.g. an inline script without hash).
 *   CHROME_PATH=/usr/bin/google-chrome npm run test:csp -w @dah/web
 */
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, 'out');
const { policy } = JSON.parse(readFileSync(join(root, '.csp', 'csp-hashes.json'), 'utf8'));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.txt': 'text/plain' };

const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
  let file = normalize(join(out, url));
  if (!file.startsWith(out)) return res.writeHead(403).end();
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) file = join(out, 'index.html');
  const headers = { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' };
  if (file.endsWith('.html')) headers['Content-Security-Policy'] = policy;
  res.writeHead(200, headers).end(readFileSync(file));
});

const pages = (process.env.CSP_PAGES ?? '/,/login/,/register/,/admin/,/resident/,/admin/journal/,/admin/ops/').split(',');
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
let violations = 0;
try {
  for (const p of pages) {
    const page = await browser.newPage();
    const errors = [];
    page.on('console', (m) => {
      if (/Content Security Policy|Refused to (execute|load)/i.test(m.text())) errors.push(m.text());
    });
    await page.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', (e) => {
        console.error(`Content Security Policy violation: ${e.violatedDirective} ${e.blockedURI} ${e.sample}`);
      });
    });
    await page.goto(base + p, { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    const hydrated = await page.evaluate(() => Array.isArray(self.__next_f) && document.querySelectorAll('script').length > 0);
    console.log(`${errors.length ? '✖' : '✔'} ${p} (next payload ${hydrated ? 'ok' : 'missing'})`);
    for (const e of errors) console.log('   ' + e.slice(0, 200));
    violations += errors.length + (hydrated ? 0 : 1);
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}
process.exit(violations ? 1 : 0);
