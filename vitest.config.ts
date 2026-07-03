import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Tests run against source; the published exports point at dist/.
    alias: {
      '@mosaicjs/core': fileURLToPath(
        new URL('./packages/ts/mosaic-core/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    globals: false,
    environment: 'node',
    include: ['packages/ts/*/test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['packages/ts/*/src/**/*.ts'],
      exclude: ['**/*.d.ts'],
    },
  },
});
