import { execSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  assertLocalDevelopmentHost,
  assertProductEnvironment,
  productChildEnvironment,
  productComposeArgs,
  projectRoot,
} from './product-env.mjs';
import { assertCleanReleaseCheckout } from './production-git-state.mjs';

const isProd = process.argv.includes('--prod');

if (isProd) {
  try {
    assertProductEnvironment();
  } catch (error) {
    console.error(`\nStartup aborted: ${error.message}`);
    process.exit(1);
  }
} else {
  try {
    assertLocalDevelopmentHost();
  } catch (error) {
    console.error(`\nLocal startup refused: ${error.message}`);
    process.exit(1);
  }
}

const resolveGitSha = () => {
  try {
    return execSync('git rev-parse --short HEAD', {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'unknown';
  }
};

const gitSha = isProd ? assertCleanReleaseCheckout() : resolveGitSha();

const environment = isProd
  ? productChildEnvironment({ GIT_SHA: gitSha })
  : { ...process.env, GIT_SHA: gitSha };

environment.DOCKER_BUILDKIT = '1';
environment.COMPOSE_DOCKER_CLI_BUILD = '1';

const composeArgs = isProd ? productComposeArgs : ['compose'];

if (!isProd) {
  console.log(`Starting local development stack with GIT_SHA=${gitSha}...`);
  const buildResult = spawnSync('docker', [...composeArgs, 'build', 'api', 'web'], {
    cwd: projectRoot,
    env: environment,
    stdio: 'inherit',
  });
  if (buildResult.error || buildResult.status !== 0) {
    process.exit(buildResult.status || 1);
  }
} else {
  console.log(`Starting production stack for ${gitSha}...`);
}

const upResult = spawnSync('docker', [...composeArgs, 'up', '-d', ...(isProd ? ['--no-build', '--pull', 'never'] : [])], {
  cwd: projectRoot,
  env: environment,
  stdio: 'inherit',
});

process.exit(upResult.status ?? 0);
