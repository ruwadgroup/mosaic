// @mosaicjs/ai/vercel - Vercel AI SDK v5+ adapter for Mosaic tools.
//
// Wraps the three framework-neutral descriptors as a ToolSet: each entry is
// tool({ description, inputSchema: jsonSchema(...), execute }) from the `ai`
// package. No Zod dependency. `ai` is a peer dependency of this subpath.

import { jsonSchema, tool } from 'ai';
import type { JSONSchema7 } from 'ai';
import type { ToolSet } from 'ai';

import { DEFAULT_REGISTRY, type MosaicRegistry } from '@mosaicjs/core';
import { mosaicToolDescriptors } from './index.js';

/** Build a Vercel AI SDK v5+ ToolSet for the three Mosaic introspection tools.
 *  Spread into streamText: `streamText({ tools: { ...mosaicTools() } })`. */
export function mosaicTools(registry: MosaicRegistry = DEFAULT_REGISTRY): ToolSet {
  const result: ToolSet = {};
  for (const d of mosaicToolDescriptors(registry)) {
    result[d.name] = tool({
      description: d.description,
      inputSchema: jsonSchema(d.inputSchema as JSONSchema7),
      execute: async (args: Record<string, unknown>) => d.handler(args),
    });
  }
  return result;
}
