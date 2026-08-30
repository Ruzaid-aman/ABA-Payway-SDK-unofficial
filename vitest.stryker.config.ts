import { defineConfig } from 'vitest/config';

/**
 * Vitest config for Stryker mutation runs (see stryker.config.json).
 *
 * Excludes suites that depend on the workspace outside the mutation sandbox:
 * child-process suites (spawn dist/cli.js — the sandbox excludes dist) and
 * agent CLI suites that bind to workspace-relative state. None of them cover
 * the mutated files (auth.ts, circuit-breaker.ts), so excluding them shrinks
 * the dry run without changing mutation results.
 */
export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.test.ts'],
    exclude: [
      'src/__tests__/cli.test.ts',
      'src/__tests__/agent-cli.test.ts',
      'src/__tests__/agent-r3-cli.test.ts',
      'src/__tests__/webhook-cli.test.ts',
      'src/__tests__/agent-e2e.test.ts',
    ],
    setupFiles: ['src/test/vitest-hermetic-env.ts'],
  },
});
