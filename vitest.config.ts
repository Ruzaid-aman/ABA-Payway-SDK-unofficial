import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    // Exercise checkout source in example lifecycle tests, even before the
    // example installs its packed dependency. Package smoke tests run separately.
    alias: { 'aba-payway-ts': fileURLToPath(new URL('./src/index.ts', import.meta.url)) },
  },
  test: {
    // Node 22.12 needs this flag for the real SQLite outbox recovery tests.
    execArgv: process.versions.node.startsWith('22.12.') ? ['--experimental-sqlite'] : [],
    globals: true,
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/test/vitest-hermetic-env.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/types.ts'],
      // Floor thresholds: CI fails if coverage regresses below these.
      // Ratcheted 2026-09-29 after the coverage-driven CLI/SDK test expansion
      // wave (actual: 82.9 stmts / 76.1 branch / 88.1 funcs / 83.8 lines).
      thresholds: {
        statements: 79,
        branches: 73,
        functions: 84,
        lines: 80,
      },
    },
  },
});
