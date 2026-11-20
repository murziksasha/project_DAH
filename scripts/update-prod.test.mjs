import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { evaluateHealth, healthUrls, rollbackHint, waitForHealthy } from './update-prod.mjs';

const jsonResponse = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

const fakeClock = () => {
  let current = 0;
  return {
    now: () => current,
    sleep: async (ms) => {
      current += ms;
    },
  };
};

test('evaluateHealth requires status ok and matching buildSha', () => {
  assert.equal(evaluateHealth({ status: 'ok', buildSha: 'abc1234' }, 'abc1234').ok, true);
  assert.equal(evaluateHealth({ status: 'down', buildSha: 'abc1234' }, 'abc1234').ok, false);

  const wrongSha = evaluateHealth({ status: 'ok', buildSha: 'old0000' }, 'abc1234');
  assert.equal(wrongSha.ok, false);
  assert.match(wrongSha.reason, /old0000.*abc1234/);

  const missingSha = evaluateHealth({ status: 'ok' }, 'abc1234');
  assert.equal(missingSha.ok, false);

  assert.equal(evaluateHealth(null, 'abc1234').ok, false);
});

test('health is checked on both loopback port 3001 and edge proxy port 80', () => {
  assert.deepEqual(healthUrls, [
    'http://127.0.0.1:3001/api/health',
    'http://127.0.0.1/api/health',
  ]);
  assert.equal(rollbackHint, 'npm run docker:rollback:prod');
});

test('waitForHealthy polls until all endpoints report healthy', async () => {
  const clock = fakeClock();
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls <= 2) throw new Error('ECONNREFUSED');
    if (calls <= 4) return jsonResponse({ status: 'ok', buildSha: 'old0000' });
    return jsonResponse({ status: 'ok', buildSha: 'abc1234' });
  };

  const result = await waitForHealthy({
    expectedSha: 'abc1234',
    urls: ['http://a', 'http://b'],
    fetchImpl,
    ...clock,
  });

  assert.equal(result.ok, true);
  assert.equal(result.attempts, 3);
});

test('waitForHealthy gives up after deadline and reports reasons', async () => {
  const clock = fakeClock();
  const result = await waitForHealthy({
    expectedSha: 'abc1234',
    urls: ['http://a'],
    timeoutMs: 90_000,
    intervalMs: 3_000,
    fetchImpl: async () => jsonResponse({ status: 'ok', buildSha: 'old0000' }),
    ...clock,
  });

  assert.equal(result.ok, false);
  assert.ok(clock.now() <= 90_000);
  assert.equal(result.attempts, 31);
  assert.match(result.results[0].reason, /buildSha/);
});

test('waitForHealthy treats HTTP errors and malformed JSON as unhealthy', async () => {
  const clock = fakeClock();
  const result = await waitForHealthy({
    expectedSha: 'abc1234',
    urls: ['http://a', 'http://b'],
    timeoutMs: 0,
    fetchImpl: async (url) =>
      url === 'http://a'
        ? jsonResponse({}, 502)
        : {
            ok: true,
            status: 200,
            json: async () => {
              throw new SyntaxError('Unexpected token');
            },
          },
    ...clock,
  });

  assert.equal(result.ok, false);
  assert.deepEqual(
    result.results.map((r) => r.reason),
    ['HTTP 502', 'Response is not valid JSON'],
  );
});

test('update-prod.mjs never pulls, never runs down, and never auto-rolls back', () => {
  const source = readFileSync(new URL('./update-prod.mjs', import.meta.url), 'utf8');
  const codeWithoutComments = source.replace(/^\s*\/\/.*$/gm, '');

  assert.doesNotMatch(codeWithoutComments, /'git pull'|git\s+pull/);
  assert.doesNotMatch(codeWithoutComments, /'down'/);
  assert.doesNotMatch(codeWithoutComments, /docker-rollback-prod\.mjs/);
});

test('package.json wires update:prod and test:deployment', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.scripts['update:prod'], 'node scripts/update-prod.mjs');
  assert.match(pkg.scripts['test:deployment'], /update-prod\.test\.mjs/);
});
