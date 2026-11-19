import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  assertProductEnvironment,
  productChildEnvironment,
  productComposeArgs,
  projectRoot,
} from './product-env.mjs';

const command = process.argv[2];

if (!['stop', 'logs', 'ps'].includes(command)) {
  console.error('Usage: node scripts/docker-prod-ops.mjs <stop|logs|ps> [args]');
  process.exit(1);
}

try {
  assertProductEnvironment();
} catch (error) {
  console.error(`\nOperation aborted: ${error.message}`);
  process.exit(1);
}

const extraArgs = process.argv.slice(3);
const composeArgs = command === 'logs'
  ? [...productComposeArgs, 'logs', '--tail=100', ...extraArgs]
  : [...productComposeArgs, command, ...extraArgs];

const result = spawnSync('docker', composeArgs, {
  cwd: projectRoot,
  env: productChildEnvironment(),
  stdio: 'inherit',
});

process.exit(result.status ?? 0);
