// The native-JSX reader: every brace expression form, its canonical expr
// output, binding vs computed props, the four handler forms, conditional and
// looping children, teaching errors, and the writer round-trip over the
// example gallery.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { type MosaicNode, type PropValue, parse, parseExpr, toJsxSource } from '../src/index.js';

const EXAMPLES_DIR = join(import.meta.dirname, '../../../../examples');

function root(source: string): MosaicNode {
  const result = parse(source);
  if (!result.ok) {
    throw new Error(`parse failed: ${JSON.stringify(result.errors)}`);
  }
  return result.doc.root;
}

function errorOf(source: string): { code: string; message: string } {
  const result = parse(source);
  if (result.ok) throw new Error(`expected a parse error for: ${source}`);
  const first = result.errors[0];
  if (!first) throw new Error('no error recorded');
  return { code: first.code, message: first.message };
}

/** The canonical expr a prop brace compiles to. */
function exprOf(brace: string): string {
  const node = root(`<Stat value={${brace}} />`);
  const value = node.props?.value as { $expr: string };
  expect(value).toHaveProperty('$expr');
  parseExpr(value.$expr); // the guarantee: transpiled output re-parses
  return value.$expr;
}

describe('expressions transpile to canonical expr', () => {
  it('identifiers, members, indexing, optional chaining', () => {
    expect(exprOf('seats')).toBe('seats');
    expect(exprOf('a.b.c')).toBe('a.b.c');
    expect(exprOf('rows[0].name')).toBe('rows[0].name');
    expect(exprOf('rows[i + 1]')).toBe('rows[i + 1]');
    expect(exprOf('a?.b?.c')).toBe('a.b.c');
    expect(exprOf('rows?.[0]')).toBe('rows[0]');
  });

  it('unary, arithmetic, comparison, logic, ternary, parens', () => {
    expect(exprOf('!open')).toBe('!open');
    expect(exprOf('-n + 1')).toBe('-n + 1');
    expect(exprOf('seats * 16 + (support ? 99 : 0)')).toBe('seats * 16 + (support ? 99 : 0)');
    expect(exprOf('a >= 1 && b < 2 || c != 3')).toBe('a >= 1 && b < 2 || c != 3');
    expect(exprOf('(a || b) && c')).toBe('(a || b) && c');
    expect(exprOf('a ? b : c ? d : e')).toBe('a ? b : c ? d : e');
    expect(exprOf("'x' in obj")).toBe("'x' in obj");
  });

  it('strict equality reads as loose; ?? reads as coalesce', () => {
    expect(exprOf('a === 1 || b !== 2')).toBe('a == 1 || b != 2');
    expect(exprOf('name ?? "anon"')).toBe("coalesce(name, 'anon')");
  });

  it('array literals inside expressions', () => {
    expect(exprOf('[1, 2, 3][i]')).toBe('[1, 2, 3][i]');
    expect(exprOf('sum([a, b, c])')).toBe('sum([a, b, c])');
  });

  it('template literals become concat, skipping empty parts', () => {
    expect(exprOf('`${n} seats`')).toBe("concat(n, ' seats')");
    expect(exprOf('`Showing ${a} of ${b}`')).toBe("concat('Showing ', a, ' of ', b)");
    expect(exprOf('`${x}`')).toBe('concat(x)');
  });

  it('catalog function calls pass through', () => {
    expect(exprOf('formatCurrency(seats * 16)')).toBe('formatCurrency(seats * 16)');
    expect(exprOf('clamp(n, 0, 100)')).toBe('clamp(n, 0, 100)');
    expect(exprOf("coalesce(a, b, 'x')")).toBe("coalesce(a, b, 'x')");
  });

  it('method rewrites: folds', () => {
    expect(exprOf('rows.filter(r => r.open)')).toBe('filter(rows, r, r.open)');
    expect(exprOf('rows.map(r => r.n * 2)')).toBe('map(rows, r, r.n * 2)');
    expect(exprOf('rows.some(r => r.open)')).toBe('any(rows, r, r.open)');
    expect(exprOf('rows.every(r => r.open)')).toBe('all(rows, r, r.open)');
    expect(exprOf('rows.reduce((acc, r) => acc + r.n, 0)')).toBe(
      'reduce(rows, r, acc, acc + r.n, 0)',
    );
    expect(exprOf('rows.filter(r => r.open).map(r => r.name)')).toBe(
      'map(filter(rows, r, r.open), r, r.name)',
    );
  });

  it('method rewrites: strings, arrays, numbers', () => {
    expect(exprOf('rows.length')).toBe('len(rows)');
    expect(exprOf('rows.filter(r => r.open).length')).toBe('len(filter(rows, r, r.open))');
    expect(exprOf('rows.sort()')).toBe('sort(rows)');
    expect(exprOf('rows.slice(0, 3)')).toBe('slice(rows, 0, 3)');
    expect(exprOf("tags.join(', ')")).toBe("join(tags, ', ')");
    expect(exprOf('tags.join()')).toBe("join(tags, ',')");
    expect(exprOf("tags.includes('x')")).toBe("contains(tags, 'x')");
    expect(exprOf('price.toFixed(2)')).toBe('toFixed(price, 2)');
    expect(exprOf('name.toLowerCase()')).toBe('lower(name)');
    expect(exprOf('name.toUpperCase()')).toBe('upper(name)');
    expect(exprOf('name.trim()')).toBe('trim(name)');
    expect(exprOf("csv.split(',')")).toBe("split(csv, ',')");
    expect(exprOf("s.replace('a', 'b')")).toBe("replace(s, 'a', 'b')");
  });

  it('function-form folds, canonical folds, and count with a predicate', () => {
    expect(exprOf('filter(rows, r => r.open)')).toBe('filter(rows, r, r.open)');
    expect(exprOf('filter(rows, r, r.open)')).toBe('filter(rows, r, r.open)');
    expect(exprOf('sortBy(rows, r => r.name)')).toBe('sortBy(rows, r, r.name)');
    expect(exprOf('reduce(rows, r, acc, acc + r.n, 0)')).toBe('reduce(rows, r, acc, acc + r.n, 0)');
    expect(exprOf('count(rows, r => r.open)')).toBe('count(filter(rows, r, r.open))');
    expect(exprOf('count(rows)')).toBe('count(rows)');
  });

  it('string literal quoting survives the round trip', () => {
    expect(exprOf('a == "it\'s"')).toBe("a == 'it\\'s'");
    expect(exprOf("a == 'x\\ny'")).toBe("a == 'x\\ny'");
  });
});

describe('expression rejections teach', () => {
  it('unknown functions list the catalog', () => {
    const e = errorOf('<Stat value={fetchData(1)} />');
    expect(e.code).toBe('UNKNOWN_FUNCTION');
    expect(e.message).toContain('formatCurrency');
  });

  it('unknown methods, startsWith/endsWith', () => {
    expect(errorOf('<Stat value={rows.indexOf(1)} />').code).toBe('UNKNOWN_FUNCTION');
    const e = errorOf('<Stat value={s.startsWith("a")} />');
    expect(e.code).toBe('UNKNOWN_FUNCTION');
    expect(e.message).toContain('contains');
  });

  it('assignment and mutation', () => {
    expect(errorOf('<Stat value={seats = 3} />').code).toBe('INVALID_EXPRESSION');
    expect(errorOf('<Stat value={seats += 1} />').code).toBe('INVALID_EXPRESSION');
    expect(errorOf('<Stat value={seats++} />').code).toBe('INVALID_EXPRESSION');
  });

  it('new, regex, spread, await, comma expressions', () => {
    expect(errorOf('<Stat value={new Date()} />').message).toContain('new');
    expect(errorOf('<Stat value={/x/.test} />').message).toContain('regex');
    expect(errorOf('<Stat value={[...rows]} />').message).toContain('spread');
    expect(errorOf('<Stat value={await x} />').message).toContain('await');
    expect(errorOf('<Stat value={(a, b)} />').code).toBe('INVALID_EXPRESSION');
  });

  it('arrows outside fold callbacks', () => {
    expect(errorOf('<Stat value={(x) => x} />').code).toBe('INVALID_ARROW');
    expect(errorOf('<Stat value={abs(x => x)} />').code).toBe('INVALID_ARROW');
  });

  it('two-parameter arrows in value folds (expr folds carry no index)', () => {
    const e = errorOf('<Stat value={rows.map((r, i) => i)} />');
    expect(e.code).toBe('INVALID_ARROW');
    expect(e.message).toContain('index');
  });

  it('custom sort comparators point at sortBy', () => {
    const e = errorOf('<Stat value={rows.sort((a, b) => a - b)} />');
    expect(e.message).toContain('sortBy');
  });

  it('token(...) left the language in 0.7: it is an unknown function', () => {
    expect(errorOf('<Stat value={token("color.accent")} />').code).toBe('UNKNOWN_FUNCTION');
    expect(errorOf('<Stat value={token("color.accent") + 1} />').code).toBe('UNKNOWN_FUNCTION');
  });

  it('object literals inside expressions', () => {
    expect(errorOf('<Stat value={1 + { a: 1 }} />').code).toBe('INVALID_EXPRESSION');
  });
});

describe('props', () => {
  it('string, bare-boolean, and scalar brace props', () => {
    const node = root('<Input label="Name" disabled max={10} half={0.5} on={true} none={null} />');
    expect(node.props).toEqual({
      label: 'Name',
      disabled: true,
      max: 10,
      half: 0.5,
      on: true,
      none: null,
    });
  });

  it('JSON structure stays literal; expression leaves become $expr', () => {
    const node = root(
      '<Chart alt="a" type="bar" data={[{ label: "Pro", value: seats * 16 }, { label: "Max", value: 40 }]} />',
    );
    expect(node.props?.data).toEqual([
      { label: 'Pro', value: { $expr: 'seats * 16' } },
      { label: 'Max', value: 40 },
    ]);
  });

  it('object shorthand keys expand', () => {
    const node = root('<Stat value={0} meta={{ seats, plan: plan }} />');
    expect(node.props?.meta).toEqual({ seats: { $expr: 'seats' }, plan: { $expr: 'plan' } });
  });

  it('a no-expression template prop is a plain string', () => {
    expect(root('<Stat value={0} label={`plain`} />').props?.label).toBe('plain');
  });

  it('state must be a literal object', () => {
    expect(errorOf('<Card state={{ seats: seats * 2 }} />').code).toBe('INVALID_STATE');
    expect(errorOf('<Card state={[1, 2]} />').code).toBe('INVALID_STATE');
    const ok = root('<Card state={{ seats: 12, rows: [{ a: 1 }] }} />');
    expect(ok.props?.state).toEqual({ seats: 12, rows: [{ a: 1 }] });
  });

  it('class, className, and style teach that the host owns styling', () => {
    for (const src of [
      '<Text class="a">x</Text>',
      '<Text className="a">x</Text>',
      '<Text style={{ color: "red" }}>x</Text>',
    ]) {
      const e = errorOf(src);
      expect(e.code, src).toBe('FORBIDDEN_ATTRIBUTE');
      expect(e.message).toContain('host');
    }
  });

  it('legacy directive attributes teach the native syntax', () => {
    for (const [src, hint] of [
      ['<Slider bind:state="seats" />', 'value={path}'],
      ['<Text if:show="a">x</Text>', 'cond &&'],
      ['<Text for:each="rows as r">x</Text>', '.map('],
      ['<Button on:event={{ click: "save" }}>x</Button>', 'onClick'],
    ] as const) {
      const e = errorOf(src);
      expect(e.code, src).toBe('LEGACY_DIRECTIVE');
      expect(e.message, src).toContain(hint);
    }
  });
});

describe('two-way binding', () => {
  it('value={barePath} on a control compiles to bind:state and drops the prop', () => {
    const node = root('<Slider value={seats} min={1} max={200} />');
    expect(node.directives?.['bind:state']).toBe('seats');
    expect(node.props?.value).toBeUndefined();
  });

  it('checked={barePath} binds on Checkbox/Toggle', () => {
    expect(root('<Checkbox checked={annual} />').directives?.['bind:state']).toBe('annual');
    expect(root('<Toggle checked={flags.dark} />').directives?.['bind:state']).toBe('flags.dark');
  });

  it('record paths with computed indices bind', () => {
    const node = root('<Checkbox checked={files[i].checked} />');
    expect(node.directives?.['bind:state']).toBe('files[i].checked');
  });

  it('structure blocks bind too (SegmentedControl, Tabs) and Diagram binds selection', () => {
    expect(
      root('<SegmentedControl value={audience} options={["a"]} />').directives?.['bind:state'],
    ).toBe('audience');
    expect(
      root('<Tabs value={tab} items={["A"]}><Text>a</Text></Tabs>').directives?.['bind:state'],
    ).toBe('tab');
    expect(root('<Diagram alt="d" value={selected} nodes={[]} />').directives?.['bind:state']).toBe(
      'selected',
    );
  });

  it('computed expressions stay value props; literals stay initial values', () => {
    const computed = root('<Progress value={20 * done} />');
    expect(computed.directives).toBeUndefined();
    expect(computed.props?.value).toEqual({ $expr: '20 * done' });
    const literal = root('<Slider value={12} min={1} max={20} />');
    expect(literal.directives).toBeUndefined();
    expect(literal.props?.value).toBe(12);
    const str = root('<Input value="Ada" />');
    expect(str.directives).toBeUndefined();
    expect(str.props?.value).toBe('Ada');
  });

  it('bare paths on non-control blocks are just expressions', () => {
    const node = root('<Stat label="Seats" value={seats} />');
    expect(node.directives).toBeUndefined();
    expect(node.props?.value).toEqual({ $expr: 'seats' });
  });
});

describe('events', () => {
  it('a bare intent name', () => {
    expect(root('<Button onClick={save}>x</Button>').directives?.['on:event']).toEqual({
      click: 'save',
    });
    expect(root('<Button onClick={save()}>x</Button>').directives?.['on:event']).toEqual({
      click: 'save',
    });
  });

  it('an intent with args: literals stay, expressions become $expr', () => {
    const node = root(
      '<Button onClick={order({ id: 3, total: seats * 16, tags: ["a"], meta: { plan: plan } })}>x</Button>',
    );
    expect(node.directives?.['on:event']).toEqual({
      click: {
        action: 'order',
        args: {
          id: 3,
          total: { $expr: 'seats * 16' },
          tags: ['a'],
          meta: { plan: { $expr: 'plan' } },
        },
      },
    });
  });

  it('set(path, value) and toggle(path), with or without the state. prefix', () => {
    expect(root('<Button onClick={set(seats, 100)}>x</Button>').directives?.['on:event']).toEqual({
      click: { action: 'state.set', args: { path: 'seats', value: 100 } },
    });
    expect(
      root('<Button onClick={set(data.view, "grid")}>x</Button>').directives?.['on:event'],
    ).toEqual({ click: { action: 'state.set', args: { path: 'data.view', value: 'grid' } } });
    expect(root('<Button onClick={toggle(open)}>x</Button>').directives?.['on:event']).toEqual({
      click: { action: 'state.toggle', args: { path: 'open' } },
    });
    expect(
      root('<Button onClick={state.toggle(files[2].checked)}>x</Button>').directives?.['on:event'],
    ).toEqual({ click: { action: 'state.toggle', args: { path: 'files[2].checked' } } });
  });

  it('a zero-arg arrow unwraps first', () => {
    expect(
      root('<Button onClick={() => order({ id: 3 })}>x</Button>').directives?.['on:event'],
    ).toEqual({ click: { action: 'order', args: { id: 3 } } });
  });

  it('event names camelCase from the prop', () => {
    const node = root('<Diagram alt="d" nodes={[]} onSelect={openNode} />');
    expect(node.directives?.['on:event']).toEqual({ select: 'openNode' });
  });

  it('set with a computed value compiles the expression', () => {
    expect(
      root('<Button onClick={set(seats, seats + 1)}>x</Button>').directives?.['on:event'],
    ).toEqual({
      click: { action: 'state.set', args: { path: 'seats', value: { $expr: 'seats + 1' } } },
    });
    expect(
      root('<Button onClick={() => set(display, display + "7")}>x</Button>').directives?.[
        'on:event'
      ],
    ).toEqual({
      click: { action: 'state.set', args: { path: 'display', value: { $expr: "display + '7'" } } },
    });
  });

  it('anything else lists the four forms', () => {
    for (const src of [
      '<Button onClick={a.b.c()}>x</Button>',
      '<Button onClick={save(1, 2)}>x</Button>',
      '<Button onClick={1 + 2}>x</Button>',
      '<Button onClick="save">x</Button>',
    ]) {
      const e = errorOf(src);
      expect(e.code, src).toBe('INVALID_HANDLER');
    }
  });
});

describe('children', () => {
  const texts = (node: MosaicNode): PropValue[] =>
    (node.children ?? []).map((c) => c.props?.value ?? null);

  it('text runs collapse whitespace; brace expressions become expr text nodes', () => {
    const node = root('<Text>Total:   {formatCurrency(n)} </Text>');
    expect(texts(node)).toEqual(['Total:', { $expr: 'formatCurrency(n)' }]);
  });

  it('literal braces become plain text; null renders nothing', () => {
    const node = root('<Text>{"hi"}{42}{null}</Text>');
    expect(texts(node)).toEqual(['hi', '42']);
  });

  it('comments vanish', () => {
    const node = root('<Card>{/* note */}<Text>x</Text></Card>');
    expect(node.children).toHaveLength(1);
  });

  it('{cond && <El/>} lowers to if:show', () => {
    const node = root(
      '<Card>{seats >= 100 && plan != "Max" && <Callout tone="warn">big</Callout>}</Card>',
    );
    const callout = node.children?.[0];
    expect(callout?.type).toBe('Callout');
    expect(callout?.directives?.['if:show']).toBe("seats >= 100 && plan != 'Max'");
  });

  it('{cond && nonElement} stays a text expression', () => {
    const node = root('<Text>{open && "shown"}</Text>');
    expect(texts(node)).toEqual([{ $expr: "open && 'shown'" }]);
  });

  it('ternary children lower to complementary if:show branches', () => {
    const node = root('<Card>{on ? <Text>yes</Text> : <Badge>no</Badge>}</Card>');
    expect(node.children?.[0]?.directives?.['if:show']).toBe('on');
    expect(node.children?.[1]?.directives?.['if:show']).toBe('!on');
    const negated = root('<Card>{a == b ? <Text>eq</Text> : null}</Card>');
    expect(negated.children).toHaveLength(1);
    expect(negated.children?.[0]?.directives?.['if:show']).toBe('a == b');
    const onlyElse = root('<Card>{a == b ? null : <Text>ne</Text>}</Card>');
    expect(onlyElse.children?.[0]?.directives?.['if:show']).toBe('!(a == b)');
  });

  it('a non-element ternary branch is an error', () => {
    expect(errorOf('<Card>{on ? <Text>yes</Text> : "no"}</Card>').code).toBe('INVALID_CHILD');
  });

  it('{list.map((item) => <El/>)} lowers to for:each', () => {
    const node = root('<List>{rows.map(row => <Text key={row.id}>{row.name}</Text>)}</List>');
    const row = node.children?.[0];
    expect(row?.directives?.['for:each']).toBe('rows as row');
    expect(row?.directives?.key).toEqual({ $expr: 'row.id' });
  });

  it('map with an index binds "as item, i"; derived lists transpile', () => {
    const node = root(
      '<Stack>{files.filter(f => f.open).map((f, i) => <Checkbox checked={files[i].checked} />)}</Stack>',
    );
    const row = node.children?.[0];
    expect(row?.directives?.['for:each']).toBe('filter(files, f, f.open) as f, i');
    expect(row?.directives?.['bind:state']).toBe('files[i].checked');
  });

  it('map bodies may be conditional elements: item => cond && <El/>', () => {
    const node = root('<Stack>{rows.map(r => r.open && <Text>{r.name}</Text>)}</Stack>');
    const row = node.children?.[0];
    expect(row?.directives?.['for:each']).toBe('rows as r');
    expect(row?.directives?.['if:show']).toBe('r.open');
  });

  it('map children must return an element', () => {
    const e = errorOf('<Stack>{rows.map(r => r.name)}</Stack>');
    expect(e.code).toBe('INVALID_CHILD');
    expect(e.message).toContain('element');
  });

  it('an element buried in an expression is an error', () => {
    expect(errorOf('<Card>{<Text>x</Text> && on}</Card>').code).toBe('INVALID_CHILD');
  });

  it('key: string, literal, and expression forms', () => {
    expect(root('<Card key="a" />').directives?.key).toBe('a');
    expect(root('<Card key={3} />').directives?.key).toBe('3');
    expect(root('<Card key={row.id} />').directives?.key).toEqual({ $expr: 'row.id' });
  });
});

describe('structure errors', () => {
  it('fragments say wrap in a Stack', () => {
    const e = errorOf('<><Text>a</Text></>');
    expect(e.code).toBe('FRAGMENT');
    expect(e.message).toContain('Stack');
  });

  it('mismatched and unterminated tags', () => {
    expect(errorOf('<Card><Text>x</Badge></Card>').code).toBe('MISMATCHED_TAG');
    expect(errorOf('<Card><Text>x').code).toBe('UNTERMINATED_TAG');
    expect(errorOf('<Card /><Card />').code).toBe('TRAILING_CONTENT');
  });
});

describe('the writer round-trips', () => {
  for (const file of readdirSync(EXAMPLES_DIR).filter((f) => f.endsWith('.mosaic'))) {
    it(`${file}: parse(toJsxSource(doc)) deep-equals doc`, () => {
      const text = readFileSync(join(EXAMPLES_DIR, file), 'utf8');
      const first = parse(text);
      expect(first.ok, JSON.stringify(first)).toBe(true);
      if (!first.ok) return;
      const emitted = toJsxSource(first.doc);
      // no legacy directive syntax leaks out of the writer
      expect(emitted).not.toMatch(/(bind:state|if:show|for:each|on:event)=/);
      const second = parse(emitted, { id: first.doc.id });
      expect(second.ok, JSON.stringify(second)).toBe(true);
      if (!second.ok) return;
      expect(second.doc).toEqual(first.doc);
    });
  }

  it('emits conditionals, loops, bindings, and handlers in native syntax', () => {
    const doc = parse(`
      <Card state={{ open: true, rows: [{ id: "a", n: 1 }] }}>
        {open && <Text>shown</Text>}
        {rows.map((r, i) => <Stat key={r.id} label="n" value={r.n} />)}
        <Slider value={seats} min={1} max={9} />
        <Checkbox checked={open} />
        <Button onClick={order({ total: seats * 2 })}>go</Button>
        <Button onClick={toggle(open)}>flip</Button>
        <Button onClick={set(seats, 5)}>five</Button>
      </Card>`);
    expect(doc.ok).toBe(true);
    if (!doc.ok) return;
    const out = toJsxSource(doc.doc);
    expect(out).toContain('{open && ');
    expect(out).toContain('{rows.map((r, i) => <Stat');
    expect(out).toContain('key={r.id}');
    expect(out).toContain('value={seats}');
    expect(out).toContain('checked={open}');
    expect(out).toContain('onClick={order({ total: seats * 2 })}');
    expect(out).toContain('onClick={toggle(open)}');
    expect(out).toContain('onClick={set(seats, 5)}');
  });
});
