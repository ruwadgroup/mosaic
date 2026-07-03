import { createRegistry, defineBlockSchema } from '@mosaicjs/core';
import { describe, expect, it } from 'vitest';
import { mosaicTools } from '../src/vercel.js';

describe('@mosaicjs/ai/vercel', () => {
  it('returns a ToolSet with exactly three entries', () => {
    const tools = mosaicTools();
    expect(Object.keys(tools)).toEqual(['mosaic_ls', 'mosaic_cat', 'mosaic_validate']);
  });

  it('each entry has a description string and an inputSchema', () => {
    const tools = mosaicTools();
    for (const t of Object.values(tools)) {
      expect(typeof t.description).toBe('string');
      expect(t.description?.length).toBeGreaterThan(0);
      expect(t.inputSchema).toBeDefined();
    }
  });

  it('inputSchema serializes with type "object"', () => {
    const tools = mosaicTools();
    for (const t of Object.values(tools)) {
      // jsonSchema() from the ai package wraps the raw schema in a Schema object;
      // the underlying JSON Schema is accessible via .jsonSchema.
      const schema = (t.inputSchema as { jsonSchema: { type: string } }).jsonSchema;
      expect(schema.type).toBe('object');
    }
  });

  it('execute returns the same text as the neutral handler', async () => {
    const tools = mosaicTools();
    const catTool = tools.mosaic_cat!;
    const result = await catTool.execute?.(
      { block: 'Stat' },
      {} as Parameters<typeof catTool.execute>[1],
    );
    expect(typeof result).toBe('string');
    expect(result as string).toContain('Stat');
  });

  it('execute on mosaic_ls includes all block kinds', async () => {
    const tools = mosaicTools();
    const lsTool = tools.mosaic_ls!;
    const result = await lsTool.execute?.({}, {} as Parameters<typeof lsTool.execute>[1]);
    expect(result as string).toContain('layout:');
    expect(result as string).toContain('content:');
  });

  it('execute on mosaic_validate reports INVALID source', async () => {
    const tools = mosaicTools();
    const validateTool = tools.mosaic_validate!;
    const result = await validateTool.execute?.(
      { source: '<DataTable columns={["A"]} rows={[{ a: "1" }]} />' },
      {} as Parameters<typeof validateTool.execute>[1],
    );
    expect(result as string).toContain('INVALID');
  });

  it('host block appears in mosaicTools output when registry provided', async () => {
    const FlightCard = defineBlockSchema({
      name: 'FlightCard',
      kind: 'data',
      doc: 'A single flight option.',
      props: { airline: { type: 'string', required: true, doc: 'Carrier name.' } },
      example: '<FlightCard airline="ANA" />',
    });
    const registry = createRegistry([FlightCard]);
    const tools = mosaicTools(registry);
    const lsTool = tools.mosaic_ls!;
    const result = await lsTool.execute?.({}, {} as Parameters<typeof lsTool.execute>[1]);
    expect(result as string).toContain('FlightCard (host)');
  });
});
