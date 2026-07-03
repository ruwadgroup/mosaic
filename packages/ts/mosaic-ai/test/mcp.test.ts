import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createRegistry, defineBlockSchema } from '@mosaicjs/core';
import { describe, expect, it } from 'vitest';
import { mosaicToolDescriptors, registerMosaicTools } from '../src/mcp.js';

describe('@mosaicjs/ai/mcp', () => {
  it('registers three tools on an McpServer without throwing', () => {
    const server = new McpServer({ name: 'test', version: '0.7.0' });
    expect(() => registerMosaicTools(server)).not.toThrow();
  });

  it('registers with a custom registry without throwing', () => {
    const FlightCard = defineBlockSchema({
      name: 'FlightCard',
      kind: 'data',
      doc: 'A single flight option.',
      props: { airline: { type: 'string', required: true, doc: 'Carrier name.' } },
      example: '<FlightCard airline="ANA" />',
    });
    const registry = createRegistry([FlightCard]);
    const server = new McpServer({ name: 'test', version: '0.7.0' });
    expect(() => registerMosaicTools(server, registry)).not.toThrow();
  });

  it('re-exports mosaicToolDescriptors', () => {
    expect(typeof mosaicToolDescriptors).toBe('function');
    const descriptors = mosaicToolDescriptors();
    expect(descriptors.length).toBe(3);
    expect(descriptors.map((d) => d.name)).toEqual(['mosaic_ls', 'mosaic_cat', 'mosaic_validate']);
  });
});
