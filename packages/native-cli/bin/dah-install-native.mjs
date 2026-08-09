#!/usr/bin/env node
/**
 * Shortcut: same as `dah-native install`.
 *   npx dah-install-native
 *   npm run install:native
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const here = dirname(fileURLToPath(import.meta.url));
const main = join(here, 'dah-native.mjs');
const r = spawnSync(process.execPath, [main, 'install', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env,
});
process.exit(r.status === null ? 1 : r.status);
