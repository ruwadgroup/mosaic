import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_MANIFEST,
  DEFAULT_THEME,
  type ExprValue,
  MOSAIC_MEDIA_TYPE,
  MOSAIC_VERSION,
  type MosaicNode,
  type NodeVisitor,
  blockSpec,
  compactManifest,
  evalExpr,
  exprDependencies,
  initialState,
  loadMosaic,
  parse,
  parseFence,
  parseStatePath,
  readStatePath,
  resolve,
  resolveStatePath,
  resolveToken,
  serialize,
  validate,
  walk,
  writeStatePath,
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

describe('state paths', () => {
  it('parses flat keys, member chains, and computed indices', () => {
    expect(parseStatePath('eggs')).toEqual({ root: 'eggs', segments: [] });
    expect(parseStatePath('data.view').segments).toHaveLength(1);
    expect(parseStatePath('files[i + 1].checked').segments).toHaveLength(2);
  });

  it('rejects anything that is not an ident/member/index chain', () => {
    for (const src of [
      'files.map(f)', // method call
      '"files"[0]', // leading literal
      'a + b', // arithmetic outside [...]
      'files[0] + 1',
      '[1, 2][0]',
      'sum(files)',
      '!flag',
    ]) {
      expect(() => parseStatePath(src), src).toThrow();
    }
  });

  it('resolves [index] expressions against the scope to a concrete path', () => {
    const path = parseStatePath('files[i].checked');
    expect(resolveStatePath(path, { i: 2 })).toBe('files[2].checked');
    expect(resolveStatePath(parseStatePath('eggs'), {})).toBe('eggs');
    expect(resolveStatePath(parseStatePath('data[key]'), { key: 'view' })).toBe('data["view"]');
    expect(() => resolveStatePath(path, {})).toThrow(/integer or a string/);
  });

  it('reads like expr member/index evaluation: missing segments yield null', () => {
    const scope = { files: [{ checked: true }], data: { view: 'grid' } };
    expect(readStatePath(scope, 'files[0].checked')).toBe(true);
    expect(readStatePath(scope, 'data.view')).toBe('grid');
    expect(readStatePath(scope, 'data.missing')).toBe(null);
    expect(readStatePath(scope, 'files[9].checked')).toBe(null);
  });

  it('writes copy-on-write: path containers are cloned, siblings keep identity', () => {
    const scope = {
      files: [{ checked: true }, { checked: false }],
      data: { view: 'grid' },
    };
    const next = writeStatePath(scope, 'files[1].checked', true);
    expect(next).not.toBe(scope);
    const files = next.files as Array<Record<string, ExprValue>>;
    expect(files).not.toBe(scope.files);
    expect(files[1]).not.toBe(scope.files[1]);
    expect(files[1]?.checked).toBe(true);
    expect(files[0]).toBe(scope.files[0]); // untouched sibling
    expect(next.data).toBe(scope.data); // untouched branch
    expect(scope.files[1]?.checked).toBe(false); // the original never mutates
  });

  it('flat keys stay the trivial path: root writes create keys like before', () => {
    expect(writeStatePath({}, 'eggs', 80)).toEqual({ eggs: 80 });
  });

  it('a write through a missing or mismatched container warns and is a no-op', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const scope = { files: [{ checked: true }] };
      expect(writeStatePath(scope, 'nope[0].checked', true)).toBe(scope);
      expect(writeStatePath(scope, 'files[9].checked', true)).toBe(scope); // out of range
      expect(writeStatePath(scope, 'files.checked', true)).toBe(scope); // string key into an array
      expect(warn).toHaveBeenCalledTimes(3);
    } finally {
      warn.mockRestore();
    }
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

  it('for:each binds the optional zero-based index: "rows as row, i"', () => {
    const doc = loadMosaic(`
      <Stack state={{ rows: [{ name: "a" }, { name: "b" }] }}>
        <Text for:each="rows as row, i">{expr("concat(i, ':', row.name)")}</Text>
      </Stack>`);
    expect(validate(doc, DEFAULT_MANIFEST).ok).toBe(true);
    const texts: string[] = [];
    const visitor: NodeVisitor<null> = {
      primitive: () => null,
      text: (v) => {
        texts.push(v);
        return null;
      },
    };
    walk(resolve(doc, DEFAULT_MANIFEST), visitor, DEFAULT_MANIFEST);
    expect(texts).toEqual(['0:a', '1:b']);
  });

  it('resolve rewrites bind:state to the concrete path; the stored IR keeps the authored one', () => {
    const doc = loadMosaic(`
      <Stack state={{ files: [{ checked: true }, { checked: false }, { checked: true }] }}>
        <Checkbox for:each="files as f, i" bind:state="files[i].checked" label={expr("f.path")} />
      </Stack>`);
    expect(validate(doc, DEFAULT_MANIFEST).ok).toBe(true);
    const resolved = resolve(doc, DEFAULT_MANIFEST);
    expect(resolved.root.children).toHaveLength(3);
    const third = resolved.root.children?.[2];
    expect(third?.directives?.['bind:state']).toBe('files[2].checked');
    expect(third?.props?.value).toBe(true);
    expect(resolved.root.children?.[1]?.props?.value).toBe(false);
    expect(doc.root.children?.[0]?.directives?.['bind:state']).toBe('files[i].checked');
  });

  it('from:state follows record paths', () => {
    const doc = loadMosaic(`
      <Stack state={{ data: { view: "grid" } }}>
        <Input label="View" from:state="data.view" />
      </Stack>`);
    const resolved = resolve(doc, DEFAULT_MANIFEST);
    expect(resolved.root.children?.[0]?.props?.value).toBe('grid');
  });

  it('flags bind:state / from:state strings that are not paths', () => {
    for (const src of [
      '<Slider label="x" bind:state="files.map(f)" min={0} max={1} />',
      '<Input label="x" from:state="1 + count" />',
    ]) {
      const result = validate(loadMosaic(src), DEFAULT_MANIFEST);
      expect(result.ok, src).toBe(false);
      if (result.ok) continue;
      expect(
        result.errors.some((e) => e.code === 'INVALID_STATE_PATH'),
        src,
      ).toBe(true);
    }
  });

  it('a non-interactive host renders default states', () => {
    const doc = loadMosaic('<Stack state={{ on: false }}><Text if:show="on">secret</Text></Stack>');
    const still = resolve(doc, { ...DEFAULT_MANIFEST, interactive: false });
    expect(still.root.children).toHaveLength(1); // if:show ignored, default state kept
  });

  it('Timeline decomposes to "date - title - description"; tone stays visual-only', () => {
    const doc = loadMosaic(`
      <Timeline items={[
        { date: "May 3", title: "Incident opened", description: "Elevated 5xx from the queue", tone: "warn" },
        { date: "May 4", title: "Resolved" },
      ]} />`);
    const bare = { ...DEFAULT_MANIFEST, components_supported: [] };
    const out = walk(
      doc,
      {
        primitive: (_type, _props, children) => children.join('\n'),
        text: (v) => v,
      },
      bare,
    );
    expect(out).toContain('May 3 - Incident opened - Elevated 5xx from the queue');
    expect(out).toContain('May 4 - Resolved');
    expect(out).not.toContain('warn');
    expect(out).not.toContain('\u2014'); // the em dash is gone from the floor
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

describe('the Diagram block', () => {
  const diagram = (props: string) =>
    loadMosaic(`<Diagram alt="From monolith to services" ${props} />`);

  it('a well-formed diagram validates: groups, group refs, group-to-group edges', () => {
    const doc = diagram(`
      nodes={[
        { id: "client", label: "Client", kind: "client" },
        { id: "monolith", label: "Monolith", kind: "service", group: "before" },
        { id: "api", label: "API", kind: "service", group: "after" },
      ]}
      groups={[{ id: "before", label: "Before" }, { id: "after", label: "After" }]}
      edges={[{ from: "client", to: "monolith" }, { from: "before", to: "after", label: "extract" }]}`);
    const result = validate(doc, DEFAULT_MANIFEST);
    expect(result.ok, JSON.stringify(result, null, 2)).toBe(true);
  });

  it('flags duplicate ids, dangling edge endpoints, and unknown group refs', () => {
    for (const props of [
      // duplicate id across nodes
      'nodes={[{ id: "a", label: "A" }, { id: "a", label: "Again" }]} edges={[]}',
      // duplicate id across nodes and groups
      'nodes={[{ id: "a", label: "A" }]} groups={[{ id: "a", label: "Group A" }]} edges={[]}',
      // edge endpoint that is neither a node nor a group
      'nodes={[{ id: "a", label: "A" }]} edges={[{ from: "a", to: "ghost" }]}',
      // node referencing an undeclared group
      'nodes={[{ id: "a", label: "A", group: "ghost" }]} edges={[]}',
    ]) {
      const result = validate(diagram(props), DEFAULT_MANIFEST);
      expect(result.ok, props).toBe(false);
      if (result.ok) continue;
      expect(
        result.errors.some((e) => e.code === 'INVALID_DIAGRAM'),
        props,
      ).toBe(true);
    }
  });

  it('malformed shapes are diagnostics, not crashes', () => {
    for (const props of [
      'nodes="not an array" edges={[]}',
      'nodes={[{ label: "no id" }]} edges={[]}',
      'nodes={[{ id: "a", label: "A" }]} edges={["a -> b"]}',
    ]) {
      const result = validate(diagram(props), DEFAULT_MANIFEST);
      expect(result.ok, props).toBe(false);
      if (result.ok) continue;
      expect(
        result.errors.some((e) => e.code === 'INVALID_DIAGRAM'),
        props,
      ).toBe(true);
    }
  });

  it('decomposes to alt, group headings, node lines, and ASCII edge lines', () => {
    const doc = diagram(`
      nodes={[
        { id: "client", label: "Client", kind: "client" },
        { id: "monolith", label: "Monolith", kind: "service", group: "before" },
        { id: "api", label: "API", kind: "service", group: "after" },
        { id: "worker", label: "Worker", kind: "service", group: "after" },
      ]}
      groups={[{ id: "before", label: "Before" }, { id: "after", label: "After" }]}
      edges={[{ from: "before", to: "after", label: "extract" }, { from: "client", to: "monolith" }]}`);
    const stack = blockSpec('Diagram')?.decomposeTo?.(doc.root);
    expect(stack?.type).toBe('Stack');
    const lines = (stack?.children ?? []).map((child) => ({
      bold: child.props?.weight === 'bold',
      text: child.children?.[0]?.props?.value,
    }));
    expect(lines).toEqual([
      { bold: true, text: 'From monolith to services' },
      { bold: true, text: 'Before' },
      { bold: false, text: '- Monolith (service)' },
      { bold: true, text: 'After' },
      { bold: false, text: '- API (service)' },
      { bold: false, text: '- Worker (service)' },
      { bold: true, text: 'Nodes' },
      { bold: false, text: '- Client (client)' },
      { bold: false, text: 'Before -> After - extract' },
      { bold: false, text: 'Client -> Monolith' },
    ]);
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
