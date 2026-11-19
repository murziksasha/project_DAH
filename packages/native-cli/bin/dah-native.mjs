#!/usr/bin/env node
/**
 * Native host CLI for «Мій дім» / DAH monorepo.
 *
 * Usage (from repo root, after npm install):
 *   npx dah-native install
 *   npx dah-install-native
 *   npx dah-native update
 *   npx dah-native uninstall
 *   npm run install:native
 *
 * Env (install): DAH_ROOT, RUN_USER, WEB_PORT, SKIP_NGINX
 * Env (update):  SKIP_PULL, SKIP_INSTALL, SKIP_GENERATE, SKIP_BUILD, SKIP_MIGRATE, SKIP_RESTART
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const __dirname = dirname(fileURLToPath(import.meta.url));
/** monorepo root: packages/native-cli/bin → ../../.. */
const REPO_ROOT = resolve(__dirname, '../../..');

const INSTALL_SH = join(REPO_ROOT, 'infra/scripts/install-native-systemd.sh');
const UPDATE_SH = join(REPO_ROOT, 'infra/scripts/update-native.sh');

function usage(code = 0) {
  const lines = [
    'dah-native — native host helpers (Linux + systemd, no Docker)',
    '',
    'Commands:',
    '  install     Linux: systemd+nginx | Windows: install-native-windows.ps1 (Scheduled Task)',
    '  update      install → generate → build → migrate → restart',
    '              (win: no git pull — update tree yourself; linux: bash may still pull)',
    '  uninstall   Windows: stop stack + unregister task + firewall',
    '              (add -FullWipe -ConfirmYes to remove Postgres/Node/nginx/repo)',
    '  help        Show this help',
    '',
    'Examples:',
    '  npx dah-native install',
    '  npx dah-install-native',
    '  npm run install:native:win          # Windows explicit',
    '  npm run update:native:win           # Windows rebuild + migrate + restart (no pull)',
    '  npm run uninstall:native:win        # Windows stop + unregister (keep Postgres/Node)',
    '  npm run uninstall:native:win -- -FullWipe -ConfirmYes',
    '  sudo npx dah-native install         # Linux',
    '  npx dah-native update',
    '',
    'Docs: docs/NATIVE-HOST.md · docs/NATIVE-HOST-WINDOWS.md · docs/KEENDNS-WINDOWS.md',
  ];
  console.log(lines.join('\n'));
  process.exit(code);
}

function isLinux() {
  return process.platform === 'linux';
}

function isRoot() {
  return typeof process.getuid === 'function' && process.getuid() === 0;
}

function findBash() {
  if (process.platform === 'win32') {
    const candidates = [
      'C:\\Program Files\\Git\\bin\\bash.exe',
      'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
      process.env.PROGRAMFILES ? join(process.env.PROGRAMFILES, 'Git', 'bin', 'bash.exe') : '',
    ].filter(Boolean);
    for (const c of candidates) {
      if (existsSync(c)) return c;
    }
  }
  return 'bash';
}

function runBashScript(scriptPath, { needRoot = false } = {}) {
  if (!existsSync(scriptPath)) {
    console.error(`Script not found: ${scriptPath}`);
    console.error(`Expected monorepo root at: ${REPO_ROOT}`);
    process.exit(1);
  }

  const bash = findBash();
  const env = {
    ...process.env,
    DAH_ROOT: process.env.DAH_ROOT || REPO_ROOT,
  };

  /** @type {string[]} */
  let cmd;
  /** @type {string[]} */
  let args;

  if (needRoot && isLinux() && !isRoot()) {
    cmd = 'sudo';
    args = ['-E', bash, scriptPath];
    // -E keeps DAH_ROOT / RUN_USER from the caller when sudoers allows it
  } else {
    cmd = bash;
    args = [scriptPath];
  }

  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    env,
    cwd: env.DAH_ROOT,
    shell: false,
  });

  if (result.error) {
    if (result.error.code === 'ENOENT') {
      if (cmd === 'sudo') {
        console.error('');
        console.error('sudo not found (or not in PATH).');
        console.error('Options:');
        console.error('  1) Install sudo:  apt install sudo   (as root)');
        console.error('  2) Run as root:   su -');
        console.error(`     then:  RUN_USER=youruser DAH_ROOT=${REPO_ROOT} bash ${scriptPath}`);
        console.error('  3) On Windows: use the Linux host laptop — this install needs systemd.');
      } else {
        console.error(`Command not found: ${cmd}`);
        console.error('Install Git Bash (Windows) or bash (Linux).');
      }
      process.exit(1);
    }
    console.error(result.error.message);
    process.exit(1);
  }

  process.exit(result.status === null ? 1 : result.status);
}

function cmdInstall() {
  if (process.platform === 'win32') {
    const ps1 = join(REPO_ROOT, 'infra/scripts/install-native-windows.ps1');
    if (!existsSync(ps1)) {
      console.error(`Missing ${ps1}`);
      process.exit(1);
    }
    console.log('Windows host → infra/scripts/install-native-windows.ps1 (no Docker, Scheduled Task)');
    console.log('Docs: docs/NATIVE-HOST-WINDOWS.md');
    const r = spawnSync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1],
      { stdio: 'inherit', cwd: REPO_ROOT, env: process.env },
    );
    if (r.error) {
      console.error(r.error.message);
      process.exit(1);
    }
    process.exit(r.status === null ? 1 : r.status);
  }
  if (!isLinux()) {
    console.error(`dah-native install: unsupported platform ${process.platform}`);
    console.error('Linux: docs/NATIVE-HOST.md · Windows: docs/NATIVE-HOST-WINDOWS.md');
    process.exit(1);
  }
  runBashScript(INSTALL_SH, { needRoot: true });
}

function runWinPs1(ps1, label) {
  if (!existsSync(ps1)) {
    console.error(`Missing ${ps1}`);
    process.exit(1);
  }
  console.log(`Windows host → ${label}`);
  console.log('Docs: docs/NATIVE-HOST-WINDOWS.md');
  const extra = process.argv.slice(3);
  const r = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1, ...extra],
    { stdio: 'inherit', cwd: REPO_ROOT, env: process.env },
  );
  if (r.error) {
    console.error(r.error.message);
    process.exit(1);
  }
  process.exit(r.status === null ? 1 : r.status);
}

function cmdUninstall() {
  if (process.platform !== 'win32') {
    console.error('dah-native uninstall: Windows only.');
    console.error('Linux: sudo systemctl disable --now dah.target  (see docs/NATIVE-HOST.md)');
    process.exit(1);
  }
  const ps1 = join(REPO_ROOT, 'infra/scripts/uninstall-native-windows.ps1');
  runWinPs1(ps1, 'infra/scripts/uninstall-native-windows.ps1');
}

function cmdUpdate() {
  // Windows: dedicated PowerShell update (stop → build → migrate → start).
  // Linux: bash update-native.sh (systemctl restart when units present).
  if (process.platform === 'win32') {
    const ps1 = join(REPO_ROOT, 'infra/scripts/update-native-windows.ps1');
    if (!existsSync(ps1)) {
      console.error(`Missing ${ps1}`);
      console.error('Fallback: install Git Bash and use infra/scripts/update-native.sh with SKIP_RESTART=1');
      process.exit(1);
    }
    console.log('Windows host → infra/scripts/update-native-windows.ps1');
    console.log('Docs: docs/NATIVE-HOST-WINDOWS.md · docs/KEENDNS-WINDOWS.md');
    const r = spawnSync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1],
      { stdio: 'inherit', cwd: REPO_ROOT, env: process.env },
    );
    if (r.error) {
      console.error(r.error.message);
      process.exit(1);
    }
    process.exit(r.status === null ? 1 : r.status);
  }
  runBashScript(UPDATE_SH, { needRoot: false });
}

const argv = process.argv.slice(2);
const command = (argv[0] || 'help').toLowerCase();

switch (command) {
  case 'install':
  case 'i':
    cmdInstall();
    break;
  case 'update':
  case 'u':
    cmdUpdate();
    break;
  case 'uninstall':
  case 'remove':
    cmdUninstall();
    break;
  case 'help':
  case '-h':
  case '--help':
    usage(0);
    break;
  default:
    console.error(`Unknown command: ${command}\n`);
    usage(1);
}
