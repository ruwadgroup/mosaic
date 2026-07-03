// Scopes vitest to this package so `pnpm test` works from the package dir;
// the repo-root config drives full-repo runs. Mirror the root alias: tests run
// against source, while the published exports point at dist/.

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@mosaicjs/core': fileURLToPath(new URL('./src/index.ts', import.meta.url)),
    },
  },
  test: {
    globals: false,
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
