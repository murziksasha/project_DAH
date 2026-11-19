import * as fs from 'fs';
import * as path from 'path';

/**
 * L1: single product version — root package.json of the monorepo ("dah-osmd").
 * DAH_VERSION overrides (e.g. Docker images built without the root manifest).
 */
function readRootVersion(): string | null {
  let dir = __dirname;
  for (let i = 0; i < 8; i++) {
    const file = path.join(dir, 'package.json');
    try {
      const pkg = JSON.parse(fs.readFileSync(file, 'utf8')) as { name?: string; version?: string };
      if (pkg.name === 'dah-osmd' && pkg.version) return pkg.version;
    } catch {
      /* keep walking */
    }
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return null;
}

export const APP_VERSION: string =
  process.env.DAH_VERSION?.trim() || readRootVersion() || process.env.npm_package_version || '0.0.0';
