import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  assertProductEnvironment,
  productChildEnvironment,
  projectRoot,
  rollbackComposeArgs,
  rollbackImageRefs,
} from './product-env.mjs';
import {
  assertImagesPresent,
  assertProductionDockerState,
} from './production-docker-state.mjs';

export const buildRollbackPlan = () => {
  const up = [
    ...rollbackComposeArgs,
    'up',
    '-d',
    '--no-build',
    '--pull',
    'never',
    '--force-recreate',
    'api',
    'worker',
    'web',
  ];
  return {
    composeArgs: rollbackComposeArgs,
    steps: [
      [...rollbackComposeArgs, 'config', '-q'],
      up,
    ],
  };
};

export const executeRollback = ({ run = spawnSync } = {}) => {
  let config;
  try {
    config = assertProductEnvironment();
    assertProductionDockerState(config);
    assertImagesPresent(rollbackImageRefs);
  } catch (error) {
    console.error(`\nRollback aborted: ${error.message}`);
    process.exit(1);
  }

  console.log('[docker:rollback:prod] Starting rollback images on existing volumes...');
  const plan = buildRollbackPlan();
  for (const step of plan.steps) {
    const result = run('docker', step, {
      cwd: projectRoot,
      env: productChildEnvironment(),
      stdio: 'inherit',
    });
    if (result.error || result.status !== 0) {
      console.error('\nRollback step failed. See output above.');
      process.exit(result.status || 1);
    }
  }
  console.log('\nRollback complete: previous release images (:rollback) are running on the existing volumes.');
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  executeRollback();
}
