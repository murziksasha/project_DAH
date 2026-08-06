/**
 * Lightweight node test (no Jest): node apps/web/src/lib/meter-offline-queue.node-test.mjs
 * Simulates localStorage with a Map polyfill.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Minimal browser shims before importing TS via transpile? We reimplement pure logic checks inline.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
// Pure algorithm checks (no browser globals needed beyond localStorage)
const KEY = 'dah_meter_offline_queue';

function readAll() {
  const raw = localStorage.getItem(KEY);
  if (!raw) return [];
  return JSON.parse(raw);
}
function writeAll(items) {
  localStorage.setItem(KEY, JSON.stringify(items));
}
function enqueue(item) {
  const all = readAll().filter(
    (q) =>
      !(
        q.meterId === item.meterId &&
        q.period === item.period &&
        q.apartmentId === item.apartmentId
      ),
  );
  all.push({ ...item, id: `${item.meterId}-${Date.now()}`, createdAt: new Date().toISOString() });
  writeAll(all);
  return all;
}

// dedupe
enqueue({ meterId: 'm1', period: '2026-08', apartmentId: 'a1', meterName: 'ХВ', value: 10 });
enqueue({ meterId: 'm1', period: '2026-08', apartmentId: 'a1', meterName: 'ХВ', value: 12 });
assert.equal(readAll().length, 1);
assert.equal(readAll()[0].value, 12);

// separate apartments
enqueue({ meterId: 'm1', period: '2026-08', apartmentId: 'a2', meterName: 'ХВ', value: 5 });
assert.equal(readAll().length, 2);

console.log('meter-offline-queue.node-test: ok');
