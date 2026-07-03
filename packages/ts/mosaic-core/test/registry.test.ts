// createRegistry, expandsTo macros, and registry threading: fail-fast
// construction (the gate that makes a registry trustworthy), JSON round-trips,
// macro expansion with {children} splicing, and validate/ls/cat over a custom
// or subset registry.

import { describe, expect, it } from 'vitest';

import { Card, Text } from '../src/blocks.js';
import {
  type BlockDefinition,
  DEFAULT_MANIFEST,
  DEFAULT_REGISTRY,
  type MosaicNode,
  createRegistry,
  defaultBlocks,
  defineBlockSchema,
  describeBlock,
  expandMacro,
  listBlocks,
  parse,
  validate,
} from '../src/index.js';

const FlightCard = defineBlockSchema({
  name: 'FlightCard',
  kind: 'data',
  doc: 'A single flight option with price and times.',
  props: {
    airline: { type: 'string', required: true, doc: 'Carrier name.' },
    price: { type: 'string', required: true, doc: 'Display price.' },
    recommended: { type: 'boolean', doc: 'Highlight as the best option.' },
  },
  example: '<FlightCard airline="ANA" price="$820" recommended />',
  expandsTo: `
    <Card tone={recommended ? "ok" : "subtle"}>
      <Stack direction="horizontal" justify="between" align="center">
        <Text>{airline}</Text>
        <Text variant="label">{price}</Text>
      </Stack>
      {children}
    </Card>`,
});

function rootOf(source: string): MosaicNode {
  const result = parse(source);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.doc.root;
}

describe('createRegistry is fail-fast', () => {
  it('accepts the default blocks plus a documented custom block', () => {
    const registry = createRegistry([...defaultBlocks, FlightCard]);
    expect(registry.has('FlightCard')).toBe(true);
    expect(registry.get('DataTable')?.decompose).toBeTypeOf('function');
  });

  it('rejects a non-PascalCase name', () => {
    expect(() => createRegistry([{ ...FlightCard, name: 'flightCard' }])).toThrow(/PascalCase/);
  });

  it('rejects a collision with a built-in', () => {
    const impostor: BlockDefinition = { ...Card, doc: 'My own card.' };
    expect(() => createRegistry([...defaultBlocks, FlightCard, impostor])).toThrow(
      /declared twice/,
    );
    expect(() => createRegistry([impostor])).toThrow(/redefines a built-in/);
  });

  it('rejects an undocumented prop', () => {
    const undocumented = defineBlockSchema({
      ...FlightCard,
      props: { ...FlightCard.props, seat: { type: 'string', doc: '' } },
    });
    expect(() => createRegistry([undocumented])).toThrow(/"seat" needs a non-empty doc/);
  });

  it('rejects an example that does not parse or validate', () => {
    expect(() => createRegistry([{ ...FlightCard, example: '<FlightCard' }])).toThrow(
      /example does not parse/,
    );
    expect(() => createRegistry([{ ...FlightCard, example: '<FlightCard price="$1" />' }])).toThrow(
      /example does not validate.*airline/,
    );
    // strict inside examples: a tag outside the registry fails construction
    expect(() =>
      createRegistry([
        { ...FlightCard, example: '<Mystery><FlightCard airline="a" price="b" /></Mystery>' },
      ]),
    ).toThrow(/example does not validate.*UNKNOWN_TAG/);
  });

  it('rejects an expandsTo referencing an undeclared prop', () => {
    expect(() =>
      createRegistry([{ ...FlightCard, expandsTo: '<Card><Text>{cabin}</Text></Card>' }]),
    ).toThrow(/expandsTo references "cabin"/);
  });

  it('allows expandsTo to bind loop items over a declared prop', () => {
    const legs = defineBlockSchema({
      name: 'LegList',
      kind: 'data',
      doc: 'Flight legs.',
      props: { legs: { type: 'string[]', required: true, doc: 'Leg labels.' } },
      example: '<LegList legs={["NRT-SIN"]} />',
      expandsTo: '<Stack>{legs.map((leg) => <Text>{leg}</Text>)}</Stack>',
    });
    expect(() => createRegistry([legs])).not.toThrow();
  });
});

describe('expandMacro', () => {
  const registry = createRegistry([...defaultBlocks, FlightCard]);

  it('interpolates props, evaluates conditional tone, and splices {children}', () => {
    const node = rootOf(
      '<FlightCard airline="ANA" price="$820" recommended><Text>Lie-flat seats</Text></FlightCard>',
    );
    const expanded = expandMacro(node, registry);
    expect(expanded?.type).toBe('Card');
    expect(expanded?.props?.tone).toBe('ok');
    const row = expanded?.children?.[0];
    expect(row?.type).toBe('Stack');
    expect(row?.children?.[0]?.children?.[0]?.props?.value).toBe('ANA');
    expect(row?.children?.[1]?.children?.[0]?.props?.value).toBe('$820');
    // the {children} slot received the node's own children
    const spliced = expanded?.children?.[1];
    expect(spliced?.type).toBe('Text');
    expect(spliced?.children?.[0]?.props?.value).toBe('Lie-flat seats');
  });

  it('falls to the other branch when the flag is absent', () => {
    const node = rootOf('<FlightCard airline="JAL" price="$700" />');
    const expanded = expandMacro(node, registry);
    expect(expanded?.props?.tone).toBe('subtle');
    // no children on the original node: the slot splices to nothing
    expect(expanded?.children).toHaveLength(1);
  });

  it('returns null for a block without expandsTo', () => {
    expect(expandMacro(rootOf('<Card><Text>x</Text></Card>'), registry)).toBeNull();
    expect(expandMacro(rootOf('<Card />'), DEFAULT_REGISTRY)).toBeNull();
  });
});

describe('registry JSON round-trip', () => {
  it('a data-only registry survives toJSON -> createRegistry unchanged', () => {
    const registry = createRegistry([FlightCard]);
    const revived = createRegistry(JSON.parse(JSON.stringify(registry.toJSON())));
    expect(revived.toJSON()).toEqual(registry.toJSON());
    expect(listBlocks(revived)).toEqual(listBlocks(registry));
  });

  it('built-ins drop decompose in JSON but rehydrate it on createRegistry', () => {
    const json = JSON.parse(JSON.stringify(DEFAULT_REGISTRY.toJSON()));
    expect(json.blocks.find((b: BlockDefinition) => b.name === 'Stat').decompose).toBeUndefined();
    const revived = createRegistry(json);
    expect(revived.get('Stat')?.decompose).toBe(DEFAULT_REGISTRY.get('Stat')?.decompose);
    expect(revived.toJSON()).toEqual(DEFAULT_REGISTRY.toJSON());
  });
});

describe('registry threading', () => {
  const subset = createRegistry([Card, Text]);

  it('a subset registry lists exactly its blocks (kind-grouped)', () => {
    expect(listBlocks(subset).map((b) => b.name)).toEqual(['Text', 'Card']); // content < layout
    expect(listBlocks(subset).every((b) => b.host === false)).toBe(true);
  });

  it('validate flags blocks outside the subset as UNKNOWN_TAG under strict', () => {
    const doc = parse('<Card><Stat label="A" value="1" /></Card>');
    if (!doc.ok) throw new Error('parse failed');
    const result = validate(doc.doc, { ...DEFAULT_MANIFEST, strict: true }, { registry: subset });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.code).toBe('UNKNOWN_TAG');
    expect(result.errors[0]?.type).toBe('Stat');
  });

  it('a registry block validates exactly like a built-in', () => {
    const registry = createRegistry([...defaultBlocks, FlightCard]);
    const missing = parse('<FlightCard price="$1" />');
    if (!missing.ok) throw new Error('parse failed');
    const bad = validate(missing.doc, DEFAULT_MANIFEST, { registry });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.errors[0]?.code).toBe('MISSING_REQUIRED_PROP');
      expect(bad.errors[0]?.prop).toBe('airline');
    }
    const removed = parse('<FlightCard airline="a" price="b" gap="2" />');
    if (!removed.ok) throw new Error('parse failed');
    const gap = validate(removed.doc, DEFAULT_MANIFEST, { registry });
    expect(gap.ok).toBe(false);
    if (!gap.ok) expect(gap.errors[0]?.code).toBe('REMOVED_PROP');
  });

  it('ls marks host blocks; cat describes them like built-ins', () => {
    const registry = createRegistry([...defaultBlocks, FlightCard]);
    const listing = listBlocks(registry);
    expect(listing.find((b) => b.name === 'FlightCard')?.host).toBe(true);
    expect(listing.find((b) => b.name === 'Card')?.host).toBe(false);
    const described = describeBlock('FlightCard', registry);
    expect(described?.requiredProps).toEqual(['airline', 'price']);
    expect(described?.example).toContain('<FlightCard');
    expect(describeBlock('FlightCard')).toBeUndefined(); // not in the default registry
  });
});
