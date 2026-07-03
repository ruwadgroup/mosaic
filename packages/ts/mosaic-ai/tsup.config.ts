// Multi-entry tsup config for @mosaicjs/ai: one output per subpath.
// Peer deps are externalized so hosts provide their own copies.

import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    vercel: 'src/vercel.ts',
    mcp: 'src/mcp.ts',
    prompt: 'src/prompt.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  target: 'es2022',
  treeshake: true,
  minify: false,
  external: ['ai', '@modelcontextprotocol/sdk', 'zod', '@mosaicjs/core'],
});
