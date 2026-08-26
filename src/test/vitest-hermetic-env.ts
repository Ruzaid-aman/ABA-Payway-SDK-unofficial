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
 */
for (const key of Object.keys(process.env)) {
  if (/^PAYWAY_/i.test(key)) {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- intentional sweep of ambient config
    delete process.env[key];
  }
}