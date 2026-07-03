// Overrides the repo-root tsup config: core ships two entries, the main API
// and the @mosaicjs/core/blocks vocabulary subpath.

import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/blocks.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  target: 'es2022',
  treeshake: true,
  minify: false,
});
