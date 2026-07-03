import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MANIFEST,
  DEFAULT_THEME,
  MOSAIC_MEDIA_TYPE,
  MOSAIC_VERSION,
  type MosaicNode,
  type NodeVisitor,
  compactManifest,
  evalExpr,
  exprDependencies,
  initialState,
  loadMosaic,
  parse,
  parseFence,
  resolve,
  resolveToken,
  serialize,
  validate,
  walk,
} from '../src/index.js';

const EXAMPLES_DIR = join(import.meta.dirname, '../../../../examples');
const exampleFiles = readdirSync(EXAMPLES_DIR).filter((f) => f.endsWith('.mosaic'));

describe('@mosaic/core', () => {
  it('pins the spec version and media type', () => {
    expect(MOSAIC_VERSION).toBe('1.0');
    expect(MOSAIC_MEDIA_TYPE).toBe('application/vnd.mosaic+json');
  });

  it('resolveToken reads a renderer theme', () => {
    expect(resolveToken(DEFAULT_THEME, 'color.accent')).toBe('#7c7cff');
    expect(resolveToken(DEFAULT_THEME, 'space.4')).toBe(16);
  });

  it('compactManifest summarizes capabilities', () => {
    const compact = compactManifest(DEFAULT_MANIFEST);
    expect(compact).toContain('interactive=true');
    expect(compact).toContain('DataTable');
    expect(compact).toContain('Embed=deny');
  });
});

describe('the compiler', () => {
  it('parses an element with props, directives, and children', () => {
    const result = parse(
      '<Card gap="3"><Text if:show="eggs > 60" tone="warn">Bulk order</Text></Card>',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const card = result.doc.root;
    expect(card.type).toBe('Card');
    expect(card.props).toEqual({ gap: '3' });
    const text = card.children?.[0] as MosaicNode;
    expect(text.directives?.['if:show']).toBe('eggs > 60');
    expect(text.children?.[0]?.props?.value).toBe('Bulk order');
  });

  it('compiles expr() and token() to refs, not code', () => {
    const result = parse(
      '<Stat label="Total" value={expr("eggs * 0.5")} accent={token("color.accent")} />',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.doc.root.props?.value).toEqual({ $expr: 'eggs * 0.5' });
    expect(result.doc.root.props?.accent).toEqual({ $token: 'color.accent' });
  });

  it('rejects lowercase HTML tags at compile time', () => {
    const result = parse('<div>nope</div>');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.code).toBe('LOWERCASE_TAG');
  });

  it('rejects code in braces: arrow functions, identifiers, member access', () => {
    for (const src of [
      '<Button on:event={{ click: handler }} />',
      '<Text size={x.y} />',
      '<Stat value={eggs * 2} />',
    ]) {
      const result = parse(src);
      expect(result.ok, src).toBe(false);
      if (result.ok) continue;
      expect(result.errors[0]?.code).toBe('CODE_IN_BRACES');
    }
  });

  it('rejects class, className, and style', () => {
    const result = parse('<Text className="x">hi</Text>');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.code).toBe('FORBIDDEN_ATTRIBUTE');
  });

  it('reads the ```mosaic fence', () => {
    expect(parseFence('```mosaic v=1 id=q3-plan')).toEqual({ version: '1', id: 'q3-plan' });
    const doc = loadMosaic('```mosaic v=1 id=demo\n<Card><Text>hi</Text></Card>\n```');
    expect(doc.id).toBe('demo');
  });

  it('serialization is canonical: stable across key order', () => {
    const a = parse('<Card gap="2" pad="3"><Text>x</Text></Card>');
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    const json = serialize(a.doc);
    const reparsed = parse(json);
    expect(reparsed.ok).toBe(true);
    if (!reparsed.ok) return;
    expect(serialize(reparsed.doc)).toBe(json);
    expect(json.indexOf('"gap"')).toBeLessThan(json.indexOf('"pad"'));
  });
});

describe('expr', () => {
  const scope = {
    eggs: 80,
    plan: 'Pro',
    tasks: [
      { n: 1, done: true },
      { n: 2, done: false },
    ],
  };

  it('arithmetic, comparison, ternary', () => {
    expect(evalExpr('eggs * 0.5', scope)).toBe(40);
    expect(evalExpr('eggs > 60 ? "bulk" : "retail"', scope)).toBe('bulk');
    expect(evalExpr("plan == 'Pro'", scope)).toBe(true);
  });

  it('string and format functions', () => {
    expect(evalExpr("concat('n=', eggs)", scope)).toBe('n=80');
    expect(evalExpr('formatCurrency(eggs * 0.5)', scope)).toBe('$40.00');
    expect(evalExpr("upper('ok')", scope)).toBe('OK');
  });

  it('array folds with bound items', () => {
    expect(evalExpr('count(filter(tasks, t, t.done))', scope)).toBe(1);
    expect(evalExpr('sum(map(tasks, t, t.n))', scope)).toBe(3);
    expect(evalExpr('any(tasks, t, t.n > 1)', scope)).toBe(true);
  });

  it('list literals fold like any array', () => {
    expect(evalExpr('sum(map([true, false, true], c, c ? 1 : 0))', {})).toBe(2);
    expect(evalExpr('[1, 2, 3][1]', {})).toBe(2);
    expect(evalExpr('count([])', {})).toBe(0);
  });

  it('reports dependencies without lambda params', () => {
    expect(exprDependencies('count(filter(tasks, t, t.owner == owner))').sort()).toEqual([
      'owner',
      'tasks',
    ]);
  });

  it('refuses what would make it a language', () => {
    expect(() => evalExpr('foo(1)', {})).toThrow(/unknown function/);
    expect(() => evalExpr('a.b(1)', {})).toThrow(/method calls/);
    expect(() => evalExpr(`(${'1+'.repeat(400)}1)`, {})).toThrow(/cost bound/);
  });
});

describe('validate / resolve / walk', () => {
  it('requires alt on visual blocks (invariant 7)', () => {
    const doc = loadMosaic('<Chart type="bar" series={[]} />');
    const result = validate(doc, DEFAULT_MANIFEST);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.code).toBe('MISSING_REQUIRED_PROP');
  });

  it('flags unknown tags and bad exprs', () => {
    const unknown = validate(loadMosaic('<RiskTable />'), { ...DEFAULT_MANIFEST, strict: true });
    expect(unknown.ok).toBe(false);
    const badExpr = validate(loadMosaic('<Text if:show="1 +">x</Text>'), DEFAULT_MANIFEST);
    expect(badExpr.ok).toBe(false);
  });

  it('the egg-slider works end to end', () => {
    const doc = loadMosaic(`
      <Card gap="3" state={{ eggs: 80 }}>
        <Slider label="Number of eggs" bind:state="eggs" min={0} max={144} step={1} />
        <Text size="xl">Total: {expr("formatCurrency(eggs * 0.50)")}</Text>
        <Text if:show="eggs > 60" tone="warn">Bulk order</Text>
        <Button on:event={{ click: { action: "order", args: { total: expr("eggs * 0.50") } } }}>
          Place order
        </Button>
      </Card>`);
    expect(validate(doc, DEFAULT_MANIFEST).ok).toBe(true);

    const resolved = resolve(doc, DEFAULT_MANIFEST);
    const texts: string[] = [];
    const visitor: NodeVisitor<null> = {
      primitive: () => null,
      text: (v) => {
        texts.push(v);
        return null;
      },
    };
    walk(resolved, visitor, DEFAULT_MANIFEST);
    expect(texts.join(' ')).toContain('$40.00');
    expect(texts.join(' ')).toContain('Bulk order');

    const retail = resolve(doc, DEFAULT_MANIFEST, { eggs: 10 });
    const retailTexts: string[] = [];
    const collect: NodeVisitor<null> = {
      primitive: () => null,
      text: (v) => {
        retailTexts.push(v);
        return null;
      },
    };
    walk(retail, collect, DEFAULT_MANIFEST);
    expect(retailTexts.join(' ')).toContain('$5.00');
    expect(retailTexts.join(' ')).not.toContain('Bulk order');
  });

  it('for:each expands with the item in scope', () => {
    const doc = loadMosaic(`
      <Stack state={{ rows: [{ name: "a" }, { name: "b" }] }}>
        <Text for:each="rows as row">{expr("row.name")}</Text>
      </Stack>`);
    const resolved = resolve(doc, DEFAULT_MANIFEST);
    expect(resolved.root.children).toHaveLength(2);
  });

  it('a non-interactive host renders default states', () => {
    const doc = loadMosaic('<Stack state={{ on: false }}><Text if:show="on">secret</Text></Stack>');
    const still = resolve(doc, { ...DEFAULT_MANIFEST, interactive: false });
    expect(still.root.children).toHaveLength(1); // if:show ignored, default state kept
  });

  it('rich components decompose where unsupported (invariant 8)', () => {
    const doc = loadMosaic('<Stat label="Done" value="3 / 6" />');
    const bare = { ...DEFAULT_MANIFEST, components_supported: [] };
    const out = walk(
      doc,
      {
        primitive: (_type, _props, children) => children.join(''),
        text: (v) => v,
      },
      bare,
    );
    expect(out).toContain('Done: 3 / 6');
  });
});

describe('the examples compile', () => {
  it('found the example gallery', () => {
    expect(exampleFiles.length).toBeGreaterThanOrEqual(5);
  });

  for (const file of exampleFiles) {
    it(`${file} parses, validates, resolves, and round-trips`, () => {
      const text = readFileSync(join(EXAMPLES_DIR, file), 'utf8');
      const doc = loadMosaic(text);
      expect(doc.id).toBe(file.replace('.mosaic', ''));

      const result = validate(doc, DEFAULT_MANIFEST);
      expect(result.ok, JSON.stringify(result, null, 2)).toBe(true);

      const resolved = resolve(doc, DEFAULT_MANIFEST, initialState(doc));
      expect(resolved.root.type).toBe(doc.root.type);

      const json = serialize(doc);
      const reparsed = parse(json);
      expect(reparsed.ok).toBe(true);
      if (reparsed.ok) expect(serialize(reparsed.doc)).toBe(json);
    });
  }
});
