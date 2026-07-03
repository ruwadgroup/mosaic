// The block-schema introspection (ls / cat) and prop-shape validation - the
// substrate for the MCP tools. These pin that validate() catches the exact
// schema mistakes a model makes (object table rows, missing required props,
// bad enum values) while leaving correct artifacts alone.

import { describe, expect, it } from 'vitest';

import { DEFAULT_MANIFEST, describeBlock, listBlocks, parse, validate } from '@mosaicjs/core';

const check = (source: string) => {
  const parsed = parse(source);
  if (!parsed.ok) throw new Error(`parse failed: ${JSON.stringify(parsed.errors)}`);
  return validate(parsed.doc, DEFAULT_MANIFEST);
};

const codes = (source: string): string[] => {
  const r = check(source);
  return r.ok ? [] : r.errors.map((e) => e.code);
};

describe('listBlocks (ls)', () => {
  it('lists documented blocks with kind + doc', () => {
    const blocks = listBlocks();
    const names = blocks.map((b) => b.name);
    expect(names).toContain('DataTable');
    expect(names).toContain('Chart');
    expect(names).toContain('Stack');
    for (const b of blocks) {
      expect(b.doc.length).toBeGreaterThan(0);
      expect(typeof b.kind).toBe('string');
    }
  });
});

describe('describeBlock (cat)', () => {
  it('returns the full schema for DataTable', () => {
    const d = describeBlock('DataTable');
    expect(d).toBeDefined();
    if (!d) return;
    const byName = Object.fromEntries(d.props.map((p) => [p.name, p]));
    expect(byName.columns?.type).toBe('string[]');
    expect(byName.rows?.type).toBe('string[][]');
    expect(d.requiredProps).toContain('columns');
    expect(d.requiredProps).toContain('rows');
    expect(d.example).toContain('<DataTable');
  });

  it('returns undefined for an unknown block', () => {
    expect(describeBlock('Nonsense')).toBeUndefined();
  });
});

describe('validate: prop shapes', () => {
  it('accepts a correct positional DataTable', () => {
    expect(codes('<DataTable columns={["A","B"]} rows={[["1","2"],["3","4"]]} />')).toHaveLength(0);
  });

  it('rejects object rows (the exact model mistake)', () => {
    const c = codes(
      '<DataTable columns={["Field","Value"]} rows={[{ field: "a", value: "b" }]} />',
    );
    expect(c).toContain('INVALID_PROP_VALUE');
  });

  it('flags a missing required prop (Chart without data)', () => {
    expect(codes('<Chart alt="x" type="bar" />')).toContain('MISSING_REQUIRED_PROP');
  });

  it('accepts a Chart with the canonical { label, value } data', () => {
    expect(
      codes(
        '<Chart alt="x" type="bar" data={[{ label: "A", value: 1 }, { label: "B", value: 2 }]} />',
      ),
    ).toHaveLength(0);
  });

  it('flags an out-of-vocabulary enum value', () => {
    expect(codes('<Badge tone="critical">x</Badge>')).toContain('INVALID_PROP_VALUE');
  });

  it('accepts an in-vocabulary enum value', () => {
    expect(codes('<Badge tone="warn">x</Badge>')).toHaveLength(0);
  });

  it('accepts a derived expression wherever a scalar is expected', () => {
    expect(codes('<Stat label="Total" value={2 * 21} />')).toHaveLength(0);
  });

  it('flags a wrong scalar type (Progress value as a string)', () => {
    expect(codes('<Progress value="lots" />')).toContain('INVALID_PROP_VALUE');
  });

  it('leaves unknown props alone (host may read extras)', () => {
    expect(codes('<Card data-tracking="x"><Text>ok</Text></Card>')).toHaveLength(0);
  });
});

describe('validate: props removed in 0.7', () => {
  const fixOf = (source: string, code: string): string => {
    const r = check(source);
    if (r.ok) throw new Error(`expected errors for: ${source}`);
    const diag = r.errors.find((e) => e.code === code);
    if (!diag) throw new Error(`no ${code} in ${JSON.stringify(r.errors)}`);
    return diag.fix ?? '';
  };

  it('gap on Stack errors and the fix says the host owns spacing', () => {
    expect(fixOf('<Stack gap="2"><Text>x</Text></Stack>', 'REMOVED_PROP')).toContain(
      'host owns spacing',
    );
  });

  it('pad, Text size/weight/caps, Icon size, Stack wrap, Tabs variant all error with fixes', () => {
    for (const [source, hint] of [
      ['<Card pad="3"><Text>x</Text></Card>', 'host owns spacing'],
      ['<Text size="xl">x</Text>', 'variant="label"'],
      ['<Text weight="bold">x</Text>', 'Markdown'],
      ['<Text caps>x</Text>', 'variant="label"'],
      ['<Icon name="wallet" size="sm" />', 'sizes icons'],
      ['<Stack wrap><Text>x</Text></Stack>', 'host owns overflow'],
      ['<Tabs items={["A"]} variant="pill"><Text>a</Text></Tabs>', 'tab chrome'],
    ] as const) {
      expect(fixOf(source, 'REMOVED_PROP'), source).toContain(hint);
    }
  });
});
