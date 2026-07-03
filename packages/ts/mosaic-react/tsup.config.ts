// Overrides the repo-root tsup config for this package's build settings.

import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  target: 'es2022',
  treeshake: true,
  minify: false,
  external: ['react', 'react-dom'],
});
