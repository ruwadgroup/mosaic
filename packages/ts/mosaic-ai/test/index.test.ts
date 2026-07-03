import { createRegistry, defineBlockSchema } from '@mosaicjs/core';
import { describe, expect, it } from 'vitest';
import {
  catBlock,
  lsBlocks,
  mosaicToolDescriptors,
  runMosaicTool,
  validateSource,
} from '../src/index.js';

describe('lsBlocks', () => {
  it('lists all blocks grouped by kind', () => {
    const out = lsBlocks();
    expect(out).toContain('layout:');
    expect(out).toContain('DataTable');
    expect(out).toContain('content:');
  });

  it('narrows to a specific kind', () => {
    const out = lsBlocks('data');
    expect(out).toContain('DataTable');
    expect(out).not.toContain('layout:');
  });

  it('marks host blocks with (host)', () => {
    const FlightCard = defineBlockSchema({
      name: 'FlightCard',
      kind: 'data',
      doc: 'A single flight option.',
      props: {
        airline: { type: 'string', required: true, doc: 'Carrier name.' },
      },
      example: '<FlightCard airline="ANA" />',
    });
    const registry = createRegistry([FlightCard]);
    const out = lsBlocks(undefined, registry);
    expect(out).toContain('FlightCard (host)');
  });
});

describe('catBlock', () => {
  it('shows a block schema with props and example', () => {
    const out = catBlock('DataTable');
    expect(out).toContain('columns: string[]');
    expect(out).toContain('rows: string[][]');
    expect(out).toContain('example:');
  });

  it('accepts multiple blocks at once', () => {
    const out = catBlock('DataTable, Chart Stack');
    expect(out).toContain('DataTable -');
    expect(out).toContain('Chart -');
    expect(out).toContain('Stack -');
    expect(out.split('---').length).toBeGreaterThanOrEqual(3);
  });

  it('handles unknown blocks', () => {
    expect(catBlock('Nope')).toContain('Unknown block');
  });

  it('shows a host block schema', () => {
    const FlightCard = defineBlockSchema({
      name: 'FlightCard',
      kind: 'data',
      doc: 'A single flight option.',
      props: {
        airline: { type: 'string', required: true, doc: 'Carrier name.' },
        price: { type: 'string', required: true, doc: 'Display price.' },
      },
      example: '<FlightCard airline="ANA" price="$820" />',
    });
    const registry = createRegistry([FlightCard]);
    const out = catBlock('FlightCard', registry);
    expect(out).toContain('FlightCard');
    expect(out).toContain('airline');
  });
});

describe('validateSource', () => {
  it('reports object-row DataTable as invalid', () => {
    const out = validateSource('<DataTable columns={["A"]} rows={[{ a: "1" }]} />');
    expect(out).toContain('INVALID');
    expect(out).toContain('INVALID_PROP_VALUE');
  });

  it('confirms a valid artifact', () => {
    expect(validateSource('<Card><Text>ok</Text></Card>')).toContain('VALID');
  });

  it('reports a compile error', () => {
    expect(validateSource('<Callout if:show="x">x</Callout>')).toContain('INVALID');
  });

  it('validates against the provided registry', () => {
    const FlightCard = defineBlockSchema({
      name: 'FlightCard',
      kind: 'data',
      doc: 'A single flight option.',
      props: {
        airline: { type: 'string', required: true, doc: 'Carrier name.' },
      },
      example: '<FlightCard airline="ANA" />',
    });
    const registry = createRegistry([FlightCard]);
    // Valid: FlightCard with required airline prop.
    const valid = validateSource('<FlightCard airline="ANA" />', registry);
    expect(valid).toContain('VALID');
    // Invalid: FlightCard missing required airline prop.
    const invalid = validateSource('<FlightCard />', registry);
    expect(invalid).toContain('INVALID');
    expect(invalid).toContain('airline');
  });
});

describe('mosaicToolDescriptors + runMosaicTool', () => {
  it('returns three tools with correct names', () => {
    const tools = mosaicToolDescriptors();
    expect(tools.map((t) => t.name)).toEqual(['mosaic_ls', 'mosaic_cat', 'mosaic_validate']);
  });

  it('each tool has an inputSchema with type object', () => {
    for (const t of mosaicToolDescriptors()) {
      expect(t.inputSchema.type).toBe('object');
    }
  });

  it('dispatches by name', () => {
    expect(runMosaicTool('mosaic_cat', { block: 'Stat' })).toContain('Stat');
  });

  it('throws on unknown tool', () => {
    expect(() => runMosaicTool('unknown_tool', {})).toThrow('unknown mosaic tool');
  });

  it('passes registry through to handlers', () => {
    const FlightCard = defineBlockSchema({
      name: 'FlightCard',
      kind: 'data',
      doc: 'A single flight option.',
      props: { airline: { type: 'string', required: true, doc: 'Carrier name.' } },
      example: '<FlightCard airline="ANA" />',
    });
    const registry = createRegistry([FlightCard]);
    const descriptors = mosaicToolDescriptors(registry);
    const lsTool = descriptors.find((t) => t.name === 'mosaic_ls')!;
    expect(lsTool.handler({})).toContain('FlightCard (host)');
  });
});
