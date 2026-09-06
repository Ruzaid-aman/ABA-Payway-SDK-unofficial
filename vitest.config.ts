import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    // Exercise checkout source in example lifecycle tests, even before the
    // example installs its packed dependency. Package smoke tests run separately.
    alias: { 'aba-payway-ts': fileURLToPath(new URL('./src/index.ts', import.meta.url)) },
  },
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
