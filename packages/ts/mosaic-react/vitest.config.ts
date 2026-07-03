// Scopes vitest to this package so `pnpm test` works from the package dir;
// the repo-root config drives full-repo runs. The core alias resolves the
// workspace source so tests run against it, not a stale dist/.

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@mosaicjs/core': fileURLToPath(new URL('../mosaic-core/src/index.ts', import.meta.url)),
    },
  },
  test: {
    globals: false,
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
