// @mosaicjs/ai/mcp - @modelcontextprotocol/sdk adapter for Mosaic tools.
//
// registerMosaicTools registers the three introspection tools on an official
// McpServer, typed with Zod input schemas (required by the MCP SDK).
// `@modelcontextprotocol/sdk` and `zod` are peer dependencies of this subpath.

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { DEFAULT_REGISTRY, type MosaicRegistry } from '@mosaicjs/core';
import { catBlock, lsBlocks, validateSource } from './index.js';

export { mosaicToolDescriptors } from './index.js';

/** Register all three Mosaic introspection tools on an McpServer.
 *  Pass a custom registry to include host-defined blocks in every output. */
export function registerMosaicTools(
  server: McpServer,
  registry: MosaicRegistry = DEFAULT_REGISTRY,
): void {
  server.registerTool(
    'mosaic_ls',
    {
      description:
        'List every Mosaic block you can compose from, grouped by kind. Call this first when building a Mosaic artifact to see what is available. Pass kind to narrow to one group.',
      inputSchema: {
        kind: z
          .string()
          .optional()
          .describe('Optional: one of layout, content, control, structure, data.'),
      },
    },
    (args) => ({
      content: [{ type: 'text' as const, text: lsBlocks(args.kind, registry) }],
    }),
  );

  server.registerTool(
    'mosaic_cat',
    {
      description:
        'Show the full prop schema for one or more Mosaic blocks - prop names, types, enum values, nested shapes, which are required - plus a minimal example each. Call this once with every block you are unsure about (e.g. "DataTable, Chart, Stack") so you write the exact schema instead of guessing.',
      inputSchema: {
        block: z
          .string()
          .describe('One or more block names, comma- or space-separated, e.g. "DataTable, Chart".'),
      },
    },
    (args) => ({
      content: [{ type: 'text' as const, text: catBlock(args.block, registry) }],
    }),
  );

  server.registerTool(
    'mosaic_validate',
    {
      description:
        'Compile and validate a Mosaic artifact (the mosaic-jsx inside a ```mosaic fence, or the bare source) and return every error, or confirm it is sound. Run this on your draft before emitting so mistakes are caught and fixed first.',
      inputSchema: {
        source: z.string().describe('The mosaic-jsx source to validate.'),
      },
    },
    (args) => ({
      content: [{ type: 'text' as const, text: validateSource(args.source, registry) }],
    }),
  );
}
