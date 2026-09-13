/**
 * Hermetic test environment guard (TD-02 remediation).
 *
 * The audit (`audit-results/four-pillars/README.md`, gate "Unit/integration
 * tests") found 6 false-negative failures whenever a developer machine or CI
 * runner exports PAYWAY_* variables: doctor checks merge `process.env` over
 * the temp-dir `.env`, and PayWay() honors ambient PAYWAY_ENV/PAYWAY_SANDBOX,
 * so real credentials hijack assertions meant for fixture values.
 *
 * This setup file scrubs every PAYWAY_* variable once per test file; suites
 * that need env-driven behaviour re-set them explicitly via vi.stubEnv().
 *
 * Storage wave 1 (2026-09-13): the CLI journals BY DEFAULT now, so any test
 * that runs in-process CLI commands WITHOUT its own APPDATA isolation would
 * write `journal.jsonl` (and webhook captures) into the developer's REAL
 * app-data profile. Pin APPDATA to a throwaway dir for every test file —
 * suites that assert app-data resolution stub their own paths via
 * vi.stubEnv()/beforeAll overrides, which win over this baseline.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

for (const key of Object.keys(process.env)) {
  if (/^PAYWAY_/i.test(key)) {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- intentional sweep of ambient config
    delete process.env[key];
  }
}

process.env.APPDATA = mkdtempSync(path.join(tmpdir(), 'payway-test-appdata-'));
