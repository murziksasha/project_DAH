import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { buildRollbackPlan } from './docker-rollback-prod.mjs';

test('buildRollbackPlan targets api, worker, and web without building or pulling', () => {
  const plan = buildRollbackPlan();
  assert.ok(Array.isArray(plan.steps));

  const upStep = plan.steps.find((s) => s.includes('up'));
  assert.ok(upStep, 'Plan must include docker compose up step');
  assert.ok(upStep.includes('--no-build'));
  assert.ok(upStep.includes('never'));
  assert.ok(upStep.includes('api'));
  assert.ok(upStep.includes('worker'));
  assert.ok(upStep.includes('web'));

  assert.ok(upStep.includes('docker-compose.rollback.yml'));
});

test('package.json wires docker:rollback:prod', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.scripts['docker:rollback:prod'], 'node scripts/docker-rollback-prod.mjs');
});
