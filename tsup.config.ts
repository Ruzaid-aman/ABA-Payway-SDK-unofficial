import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  // Source maps embed the complete source tree and internal evidence comments.
  // Keep the public tarball limited to runtime code and declarations.
  sourcemap: false,
  minify: false,
});
