import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/test/vitest-hermetic-env.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/types.ts'],
      // Floor thresholds: CI fails if coverage regresses below these.
      // Ratchet upward as the P1/P2 testability work lands (2026-08-30 review).
      thresholds: {
        statements: 74,
        branches: 69,
        functions: 80,
        lines: 74,
      },
    },
  },
});
