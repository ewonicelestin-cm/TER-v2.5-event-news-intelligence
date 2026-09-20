import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { test } from 'node:test';
const root = new URL('..', import.meta.url);
const pkg = JSON.parse(readFileSync(new URL('package.json', root)));
test('TER package exposes production and server build scripts', () => {
  assert.equal(typeof pkg.scripts.build, 'string');
  assert.equal(typeof pkg.scripts['build:server'], 'string');
});
test('v3.6 intelligence assets exist', () => {
  assert.equal(existsSync(new URL('../src/services/resilience.ts', import.meta.url)), true);
  assert.equal(existsSync(new URL('../src/services/observability.ts', import.meta.url)), true);
  assert.equal(existsSync(new URL('../database/migrations/003_v35_observability.sql', import.meta.url)), true);
});
