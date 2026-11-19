import { execFileSync } from 'node:child_process';
import { projectRoot } from './product-env.mjs';

export const assertCleanStatus = (status) => {
  if (status && status.trim()) {
    throw new Error(
      'Production release requires a clean Git checkout. Commit or remove changes before building and starting commit-tagged images.',
    );
  }
};

export const assertCleanReleaseCheckout = () => {
  const status = execFileSync(
    'git',
    ['status', '--porcelain', '--untracked-files=all'],
    { cwd: projectRoot, encoding: 'utf8' },
  );
  assertCleanStatus(status);
  return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
    cwd: projectRoot,
    encoding: 'utf8',
  }).trim();
};
