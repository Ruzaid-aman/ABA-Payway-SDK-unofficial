/**
 * Cross-platform runner for the opt-in sandbox contract suite.
 *
 * Sets SANDBOX_CONTRACT_TESTS=1 (not PAYWAY_-prefixed — the vitest
 * hermetic-env setup file scrubs every PAYWAY_* var at test-file load)
 * and delegates to vitest for the single gated suite. TLS for the
 * self-signed sandbox chain is handled inside the suite file itself
 * (beforeAll/afterAll), so no shell-level NODE_TLS_REJECT_UNAUTHORIZED
 * prefix is needed here.
 */
import { spawnSync } from 'node:child_process';

const result = spawnSync('npx', ['vitest', 'run', 'src/__tests__/sandbox-contract.test.ts'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, SANDBOX_CONTRACT_TESTS: '1' },
});
process.exit(result.status ?? 1);
