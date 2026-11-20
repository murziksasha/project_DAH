import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  assertProductEnvironment,
  productChildEnvironment,
  productComposeArgs,
  projectRoot,
} from './product-env.mjs';
import { assertCleanReleaseCheckout } from './production-git-state.mjs';

export const healthUrls = [
  'http://127.0.0.1:3001/api/health',
  'http://127.0.0.1/api/health',
];
export const defaultHealthTimeoutMs = 90_000;
export const rollbackHint = 'npm run docker:rollback:prod';

export const evaluateHealth = (payload, expectedSha) => {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, reason: 'Health response is not a valid JSON object' };
  }
  if (payload.status !== 'ok') {
    return { ok: false, reason: `Status is "${payload.status}", expected "ok"` };
  }
  if (payload.buildSha !== expectedSha) {
    return {
      ok: false,
      reason: `buildSha is "${payload.buildSha ?? 'missing'}", expected "${expectedSha}"`,
    };
  }
  return { ok: true, reason: 'healthy' };
};

const checkUrl = async (url, expectedSha, fetchImpl, requestTimeoutMs) => {
  try {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(requestTimeoutMs) });
    if (!response.ok) return { url, ok: false, reason: `HTTP ${response.status}` };
    let payload;
    try {
      payload = await response.json();
    } catch {
      return { url, ok: false, reason: 'Response is not valid JSON' };
    }
    return { url, ...evaluateHealth(payload, expectedSha), payload };
  } catch (error) {
    return { url, ok: false, reason: error?.cause?.code ?? error?.name ?? 'Request failed' };
  }
};

export const waitForHealthy = async ({
  expectedSha,
  urls = healthUrls,
  timeoutMs = defaultHealthTimeoutMs,
  intervalMs = 3_000,
  requestTimeoutMs = 5_000,
  fetchImpl = globalThis.fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = Date.now,
} = {}) => {
  const deadline = now() + timeoutMs;
  let attempts = 0;
  let results = [];
  for (;;) {
    attempts += 1;
    results = await Promise.all(
      urls.map((url) => checkUrl(url, expectedSha, fetchImpl, requestTimeoutMs)),
    );
    if (results.every((result) => result.ok)) return { ok: true, attempts, results };
    if (now() + intervalMs > deadline) return { ok: false, attempts, results };
    await sleep(intervalMs);
  }
};

const runNode = (script, args = []) =>
  spawnSync(process.execPath, [script, ...args], {
    cwd: projectRoot,
    stdio: 'inherit',
    env: process.env,
  });

const printApiLogs = () => {
  console.error('\nLast API container logs:');
  const result = spawnSync(
    'docker',
    [...productComposeArgs, 'logs', '--no-color', '--tail=80', 'api'],
    { cwd: projectRoot, stdio: 'inherit', env: productChildEnvironment() },
  );
  if (result.error) console.error(`Docker could not start: ${result.error.message}`);
};

const fail = (message, { logs = true } = {}) => {
  console.error(`\nUpdate failed: ${message}`);
  if (logs) printApiLogs();
  console.error(`\nData volumes were NOT touched. To return to the previous images run: ${rollbackHint}`);
  process.exit(1);
};

export const runDatabaseMigration = (config, { run = spawnSync } = {}) => {
  // Database migration runs as one-off container with superuser credentials
  const superuserDbUrl = `postgresql://${encodeURIComponent(config.postgresUser)}:${encodeURIComponent(config.postgresPassword)}@postgres:5432/${config.postgresDb}`;
  const environment = productChildEnvironment({
    DATABASE_URL: superuserDbUrl,
  });

  const result = run(
    'docker',
    [
      ...productComposeArgs,
      'run',
      '--rm',
      '--no-deps',
      '-e',
      'DATABASE_URL',
      'api',
      'npx',
      'prisma',
      'migrate',
      'deploy',
    ],
    {
      cwd: projectRoot,
      env: environment,
      stdio: 'inherit',
    },
  );

  if (result.error || result.status !== 0) {
    throw new Error('Database migration step failed.');
  }
};

const main = async () => {
  let config;
  let gitSha;
  try {
    config = assertProductEnvironment();
    gitSha = assertCleanReleaseCheckout();
  } catch (error) {
    console.error(`\nUpdate aborted: ${error.message}`);
    process.exit(1);
  }

  const timeoutMs = Number(process.env.UPDATE_PROD_HEALTH_TIMEOUT_MS) || defaultHealthTimeoutMs;

  console.log(`[update:prod] 1/4 Building production images for commit ${gitSha}...`);
  const build = runNode('scripts/docker-build-prod.mjs');
  if (build.error || build.status !== 0) {
    console.error('\nUpdate stopped: image build failed. Running containers were NOT changed.');
    process.exit(build.status || 1);
  }

  console.log('\n[update:prod] 2/4 Running one-off database migration with superuser...');
  try {
    runDatabaseMigration(config);
    console.log('Database migrations applied successfully.');
  } catch (error) {
    fail(error.message, { logs: false });
  }

  console.log(`\n[update:prod] 3/4 Starting production containers for ${gitSha} on existing volumes...`);
  const upResult = spawnSync(
    'docker',
    [...productComposeArgs, 'up', '-d', '--no-build', '--pull', 'never'],
    {
      cwd: projectRoot,
      env: productChildEnvironment({ GIT_SHA: gitSha }),
      stdio: 'inherit',
    },
  );
  if (upResult.error || upResult.status !== 0) {
    fail('docker compose up did not complete.');
  }

  console.log(
    `\n[update:prod] 4/4 Waiting up to ${Math.round(timeoutMs / 1000)}s for /api/health (status=ok, buildSha=${gitSha})...`,
  );
  const health = await waitForHealthy({ expectedSha: gitSha, timeoutMs });
  if (!health.ok) {
    for (const result of health.results) console.error(`  ${result.url}: ${result.reason}`);
    fail('Health check did not pass within the deadline.');
  }

  spawnSync('docker', [...productComposeArgs, 'ps'], {
    cwd: projectRoot,
    stdio: 'inherit',
    env: productChildEnvironment(),
  });

  console.log(`\nUpdate complete: release ${gitSha} is running successfully.`);
  for (const result of health.results) console.log(`  ${result.url}: ok`);
  console.log(`If any issues arise, roll back with: ${rollbackHint}`);
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
