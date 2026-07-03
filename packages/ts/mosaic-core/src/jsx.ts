// The Mosaic compiler: natural JSX -> IR (docs/proposal.md §5.1).
//
// The model writes standard JSX; the compiler *interprets* it - nothing in
// braces ever executes. Braces admit a bounded JavaScript-expression subset
// that transpiles to the canonical expr language (stored as { $expr: "…" }):
// {cond && <El/>} lowers to if:show, {list.map((x) => <El/>)} to for:each,
// value={path} / checked={path} on a control to bind:state, and on[Event]
// props to on:event intents. Every transpiled expression is re-parsed with
// the bounded expr grammar (parseExpr); if it does not parse, compilation
// fails - the safety guarantee stays structural (invariant 1).

import {
  type ActionRef,
  type Directives,
  type ExprRef,
  type MosaicNode,
  type PropValue,
  isExprRef,
  textNode,
} from './ast.js';
import { defaultBlock } from './blocks.js';
import { EXPR_FUNCTIONS, parseExpr } from './expr.js';

/** A single compile error with source location and a machine-readable code. */
export type ParseError = { line: number; column: number; message: string; code: string };

/** Thrown when the compiler encounters one or more ParseErrors. Callers that
 *  need structured errors inspect `.errors`; the message string is human-readable. */
export class JsxError extends Error {
  readonly errors: ParseError[];
  constructor(errors: ParseError[]) {
    super(errors.map((e) => `${e.line}:${e.column} ${e.code}: ${e.message}`).join('\n'));
    this.name = 'JsxError';
    this.errors = errors;
  }
}

class Source {
  readonly text: string;
  pos = 0;

  constructor(text: string) {
    this.text = text;
  }

  at(offset = 0): string {
    return this.text[this.pos + offset] ?? '';
  }

  startsWith(s: string): boolean {
    return this.text.startsWith(s, this.pos);
  }

  location(pos = this.pos): { line: number; column: number } {
    let line = 1;
    let column = 1;
    for (let i = 0; i < pos && i < this.text.length; i++) {
      if (this.text[i] === '\n') {
        line++;
        column = 1;
      } else {
        column++;
      }
    }
    return { line, column };
  }

  fail(message: string, code: string, pos = this.pos): never {
    const { line, column } = this.location(pos);
    throw new JsxError([{ line, column, message, code }]);
  }

  skipWs(): void {
    while (this.pos < this.text.length && /\s/.test(this.at())) this.pos++;
  }

  skipWsAndComments(): void {
    for (;;) {
      this.skipWs();
      if (this.startsWith('{/*')) {
        const end = this.text.indexOf('*/}', this.pos);
        if (end === -1) this.fail('unterminated comment', 'UNTERMINATED_COMMENT');
        this.pos = end + 3;
        continue;
      }
      return;
    }
  }
}

// What the parser below produces for a brace run. It is a *reading* of JS
// syntax, not JS itself: the transpiler lowers it to canonical expr source or
// rejects it with a teaching error.

type Js =
  | { k: 'lit'; v: string | number | boolean | null; pos: number }
  | { k: 'ident'; name: string; pos: number }
  | { k: 'member'; obj: Js; prop: string; pos: number }
  | { k: 'index'; obj: Js; idx: Js; pos: number }
  | { k: 'unary'; op: '!' | '-'; arg: Js; pos: number }
  | { k: 'binary'; op: string; left: Js; right: Js; pos: number }
  | { k: 'cond'; test: Js; then: Js; else: Js; pos: number }
  | { k: 'call'; callee: Js; args: Js[]; pos: number }
  | { k: 'arrow'; params: string[]; body: Js; pos: number }
  | { k: 'array'; items: Js[]; pos: number }
  | { k: 'object'; entries: Array<{ key: string; value: Js }>; pos: number }
  | { k: 'template'; quasis: string[]; exprs: Js[]; pos: number }
  | { k: 'element'; node: MosaicNode; pos: number };

function skipExprWs(src: Source): void {
  for (;;) {
    src.skipWs();
    if (src.startsWith('/*')) {
      const end = src.text.indexOf('*/', src.pos);
      if (end === -1) src.fail('unterminated comment', 'UNTERMINATED_COMMENT');
      src.pos = end + 2;
      continue;
    }
    if (src.startsWith('//')) {
      const end = src.text.indexOf('\n', src.pos);
      src.pos = end === -1 ? src.text.length : end + 1;
      continue;
    }
    return;
  }
}

/** Fail on mutation operators before any binary matching, so `seats += 1`
 *  teaches instead of confusing. */
function failOnMutation(src: Source): void {
  for (const op of ['++', '--', '+=', '-=', '*=', '/=', '%=']) {
    if (src.startsWith(op)) {
      src.fail(
        `'${op}' is not Mosaic; expressions are pure - state changes go through set(path, expression), toggle(path), or a host intent`,
        'INVALID_EXPRESSION',
      );
    }
  }
  if (src.at() === '=' && src.at(1) !== '=' && src.at(1) !== '>') {
    src.fail(
      'assignment is not Mosaic; expressions are pure - state changes go through set(path, expression), toggle(path), or a host intent',
      'INVALID_EXPRESSION',
    );
  }
}

const IDENT_RE = /^[A-Za-z_$][A-Za-z0-9_$]*/;
const ARROW_HEAD_RE =
  /^\(\s*(?:[A-Za-z_$][A-Za-z0-9_$]*(?:\s*,\s*[A-Za-z_$][A-Za-z0-9_$]*)*\s*)?\)\s*=>/;

function readJsIdent(src: Source): string | null {
  const m = IDENT_RE.exec(src.text.slice(src.pos));
  if (!m) return null;
  src.pos += m[0].length;
  return m[0];
}

/** Parse one expression (or arrow function) - the entry for brace runs,
 *  attribute values, call arguments, and arrow bodies. */
function parseJs(src: Source, jsx: boolean): Js {
  skipExprWs(src);
  const pos = src.pos;
  if (src.startsWith('...')) {
    src.fail('spread (...) is not Mosaic; write the values out', 'INVALID_EXPRESSION');
  }
  if (src.at() === '(' && ARROW_HEAD_RE.test(src.text.slice(src.pos))) {
    src.pos++; // '('
    const params: string[] = [];
    skipExprWs(src);
    while (src.at() !== ')') {
      const name = readJsIdent(src);
      if (!name) src.fail('expected a parameter name', 'INVALID_EXPRESSION');
      params.push(name);
      skipExprWs(src);
      if (src.at() === ',') {
        src.pos++;
        skipExprWs(src);
      }
    }
    src.pos++; // ')'
    skipExprWs(src);
    src.pos += 2; // '=>'
    const body = parseJs(src, jsx);
    return { k: 'arrow', params, body, pos };
  }
  return parseTernary(src, jsx);
}

function parseTernary(src: Source, jsx: boolean): Js {
  const pos = src.pos;
  const test = parseBinary(src, jsx, 0);
  skipExprWs(src);
  if (src.at() === '?' && src.at(1) !== '.' && src.at(1) !== '?') {
    src.pos++;
    const then = parseJs(src, jsx);
    skipExprWs(src);
    if (src.at() !== ':') src.fail("expected ':' in the ternary", 'INVALID_EXPRESSION');
    src.pos++;
    const alt = parseJs(src, jsx);
    return { k: 'cond', test, then, else: alt, pos };
  }
  return test;
}

/** Binary levels, loosest first. `===`/`!==` read as their loose forms; `??`
 *  is read and lowered to coalesce(...). */
const BINARY_LEVELS: string[][] = [
  ['??'],
  ['||'],
  ['&&'],
  ['===', '!==', '==', '!='],
  ['<=', '>=', '<', '>', 'in'],
  ['+', '-'],
  ['*', '/', '%'],
];

function matchBinaryOp(src: Source, ops: string[]): string | null {
  for (const op of ops) {
    if (op === 'in') {
      if (src.startsWith('in') && !/[A-Za-z0-9_$]/.test(src.at(2))) {
        src.pos += 2;
        return 'in';
      }
      continue;
    }
    if (!src.startsWith(op)) continue;
    // don't split '&&' into '&', '||' into '|', or '??' into '?'
    if (op === '<' && src.at(1) === '=') continue;
    if (op === '>' && src.at(1) === '=') continue;
    if (op === '==' && src.at(2) === '=') continue;
    if (op === '!=' && src.at(2) === '=') continue;
    src.pos += op.length;
    return op;
  }
  return null;
}

function parseBinary(src: Source, jsx: boolean, level: number): Js {
  const ops = BINARY_LEVELS[level];
  if (!ops) return parseUnary(src, jsx);
  let left = parseBinary(src, jsx, level + 1);
  for (;;) {
    skipExprWs(src);
    failOnMutation(src);
    const pos = src.pos;
    const op = matchBinaryOp(src, ops);
    if (!op) return left;
    const right = parseBinary(src, jsx, level + 1);
    left = { k: 'binary', op, left, right, pos };
  }
}

function parseUnary(src: Source, jsx: boolean): Js {
  skipExprWs(src);
  failOnMutation(src);
  const pos = src.pos;
  if (src.at() === '!' && src.at(1) !== '=') {
    src.pos++;
    return { k: 'unary', op: '!', arg: parseUnary(src, jsx), pos };
  }
  if (src.at() === '-') {
    src.pos++;
    return { k: 'unary', op: '-', arg: parseUnary(src, jsx), pos };
  }
  return parsePostfix(src, jsx);
}

function parsePostfix(src: Source, jsx: boolean): Js {
  let base = parsePrimary(src, jsx);
  for (;;) {
    skipExprWs(src);
    const pos = src.pos;
    let optional = false;
    if (src.startsWith('?.')) {
      src.pos += 2;
      optional = true;
    }
    const c = src.at();
    if (!optional && c === '.' && !/[0-9]/.test(src.at(1))) {
      src.pos++;
    } else if (!optional && c !== '[' && c !== '(') {
      return base;
    }
    if (optional && src.at() === '[') {
      src.pos++;
      const idx = parseJs(src, jsx);
      skipExprWs(src);
      if (src.at() !== ']') src.fail("expected ']'", 'INVALID_EXPRESSION');
      src.pos++;
      base = { k: 'index', obj: base, idx, pos };
      continue;
    }
    if (!optional && c === '[') {
      src.pos++;
      const idx = parseJs(src, jsx);
      skipExprWs(src);
      if (src.at() !== ']') src.fail("expected ']'", 'INVALID_EXPRESSION');
      src.pos++;
      base = { k: 'index', obj: base, idx, pos };
      continue;
    }
    if ((optional && src.at() === '(') || (!optional && c === '(')) {
      src.pos++;
      const args: Js[] = [];
      skipExprWs(src);
      if (src.at() === ')') {
        src.pos++;
      } else {
        for (;;) {
          args.push(parseJs(src, jsx));
          skipExprWs(src);
          if (src.at() === ',') {
            src.pos++;
            skipExprWs(src);
            if (src.at() === ')') {
              src.pos++;
              break;
            }
            continue;
          }
          if (src.at() === ')') {
            src.pos++;
            break;
          }
          src.fail("expected ',' or ')' in the call", 'INVALID_EXPRESSION');
        }
      }
      base = { k: 'call', callee: base, args, pos };
      continue;
    }
    // plain '.' member
    const prop = readJsIdent(src);
    if (!prop) src.fail('expected a property name', 'INVALID_EXPRESSION');
    base = { k: 'member', obj: base, prop, pos };
  }
}

const FORBIDDEN_KEYWORDS: Record<string, string> = {
  new: "'new' is not Mosaic; an artifact is data - there is nothing to construct",
  function: 'function definitions are not Mosaic; braces hold one bounded expression',
  class: 'class definitions are not Mosaic; braces hold one bounded expression',
  await: "'await' is not Mosaic; artifact data is baked in - nothing is asynchronous",
  async: "'async' is not Mosaic; artifact data is baked in - nothing is asynchronous",
  typeof: "'typeof' is not supported in Mosaic expressions",
  void: "'void' is not supported in Mosaic expressions",
  delete: "'delete' is not Mosaic; expressions are pure",
  yield: "'yield' is not Mosaic; braces hold one bounded expression",
};

function parsePrimary(src: Source, jsx: boolean): Js {
  skipExprWs(src);
  const pos = src.pos;
  const c = src.at();
  if (c === '') src.fail('unexpected end of expression', 'INVALID_EXPRESSION');
  if (src.startsWith('...')) {
    src.fail('spread (...) is not Mosaic; write the values out', 'INVALID_EXPRESSION');
  }
  if (c === '(') {
    src.pos++;
    const inner = parseJs(src, jsx);
    skipExprWs(src);
    if (src.at() !== ')') src.fail("expected ')'", 'INVALID_EXPRESSION');
    src.pos++;
    return inner;
  }
  if (c === '[') {
    src.pos++;
    const items: Js[] = [];
    for (;;) {
      skipExprWs(src);
      if (src.at() === ']') {
        src.pos++;
        return { k: 'array', items, pos };
      }
      items.push(parseJs(src, jsx));
      skipExprWs(src);
      if (src.at() === ',') {
        src.pos++;
        continue;
      }
      if (src.at() === ']') {
        src.pos++;
        return { k: 'array', items, pos };
      }
      src.fail("expected ',' or ']' in the array", 'INVALID_EXPRESSION');
    }
  }
  if (c === '{') return parseObject(src, jsx);
  if (c === '`') return parseTemplate(src, jsx);
  if (c === '"' || c === "'") return { k: 'lit', v: readString(src), pos };
  if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src.at(1)))) {
    return { k: 'lit', v: readNumber(src), pos };
  }
  if (c === '<') {
    if (!jsx) src.fail("unexpected '<' in expression", 'INVALID_EXPRESSION');
    return { k: 'element', node: parseElement(src), pos };
  }
  if (c === '/') {
    src.fail(
      'regex literals are not Mosaic; string matching is contains(str, needle)',
      'INVALID_EXPRESSION',
    );
  }
  const ident = readJsIdent(src);
  if (ident) {
    if (ident === 'true') return { k: 'lit', v: true, pos };
    if (ident === 'false') return { k: 'lit', v: false, pos };
    if (ident === 'null' || ident === 'undefined') return { k: 'lit', v: null, pos };
    const forbidden = FORBIDDEN_KEYWORDS[ident];
    if (forbidden) src.fail(forbidden, 'INVALID_EXPRESSION', pos);
    skipExprWs(src);
    if (src.startsWith('=>')) {
      src.pos += 2;
      const body = parseJs(src, jsx);
      return { k: 'arrow', params: [ident], body, pos };
    }
    return { k: 'ident', name: ident, pos };
  }
  src.fail(`unexpected '${c}' in expression`, 'INVALID_EXPRESSION');
}

function parseObject(src: Source, jsx: boolean): Js {
  const pos = src.pos;
  src.pos++; // '{'
  const entries: Array<{ key: string; value: Js }> = [];
  for (;;) {
    skipExprWs(src);
    if (src.at() === '}') {
      src.pos++;
      return { k: 'object', entries, pos };
    }
    if (src.startsWith('...')) {
      src.fail('spread (...) is not Mosaic; write the keys out', 'INVALID_EXPRESSION');
    }
    let key: string;
    let shorthandable = false;
    if (src.at() === '"' || src.at() === "'") {
      key = readString(src);
    } else {
      const ident = readJsIdent(src);
      if (!ident) src.fail('expected a key', 'INVALID_EXPRESSION');
      key = ident;
      shorthandable = true;
    }
    skipExprWs(src);
    let value: Js;
    if (src.at() === ':') {
      src.pos++;
      value = parseJs(src, jsx);
    } else if (shorthandable && (src.at() === ',' || src.at() === '}')) {
      value = { k: 'ident', name: key, pos };
    } else {
      src.fail("expected ':'", 'INVALID_EXPRESSION');
    }
    entries.push({ key, value });
    skipExprWs(src);
    if (src.at() === ',') {
      src.pos++;
      continue;
    }
    if (src.at() === '}') {
      src.pos++;
      return { k: 'object', entries, pos };
    }
    src.fail("expected ',' or '}' in the object", 'INVALID_EXPRESSION');
  }
}

function parseTemplate(src: Source, jsx: boolean): Js {
  const pos = src.pos;
  src.pos++; // '`'
  const quasis: string[] = [''];
  const exprs: Js[] = [];
  for (;;) {
    if (src.pos >= src.text.length) {
      src.fail('unterminated template literal', 'UNTERMINATED_STRING', pos);
    }
    const c = src.at();
    if (c === '\\') {
      const esc = src.at(1);
      const decoded = esc === 'n' ? '\n' : esc === 't' ? '\t' : esc;
      quasis[quasis.length - 1] += decoded;
      src.pos += 2;
      continue;
    }
    if (c === '`') {
      src.pos++;
      return { k: 'template', quasis, exprs, pos };
    }
    if (c === '$' && src.at(1) === '{') {
      src.pos += 2;
      exprs.push(parseJs(src, jsx));
      skipExprWs(src);
      if (src.at() !== '}') src.fail("expected '}' in the template", 'INVALID_EXPRESSION');
      src.pos++;
      quasis.push('');
      continue;
    }
    quasis[quasis.length - 1] += c;
    src.pos++;
  }
}

// The printer is precedence-aware so output carries no redundant parentheses,
// and every emitted string is re-parsed with parseExpr as a hard guarantee.

const L_COND = 1;
const L_OR = 2;
const L_AND = 3;
const L_EQ = 4;
const L_REL = 5;
const L_ADD = 6;
const L_MUL = 7;
const L_UNARY = 8;
const L_POSTFIX = 9;
const L_PRIMARY = 10;

const BINARY_PREC: Record<string, number> = {
  '||': L_OR,
  '&&': L_AND,
  '==': L_EQ,
  '!=': L_EQ,
  '<': L_REL,
  '<=': L_REL,
  '>': L_REL,
  '>=': L_REL,
  in: L_REL,
  '+': L_ADD,
  '-': L_ADD,
  '*': L_MUL,
  '/': L_MUL,
  '%': L_MUL,
};

/** Quote a string for the expr grammar (single quotes, minimal escapes). */
function q(s: string): string {
  let out = "'";
  for (const ch of s) {
    if (ch === '\\' || ch === "'") out += `\\${ch}`;
    else if (ch === '\n') out += '\\n';
    else if (ch === '\t') out += '\\t';
    else out += ch;
  }
  return `${out}'`;
}

const FN_SET = new Set<string>(EXPR_FUNCTIONS);
const FOLD_FNS = new Set(['map', 'filter', 'any', 'all', 'sortBy']);
const METHOD_FOLDS: Record<string, string> = {
  map: 'map',
  filter: 'filter',
  some: 'any',
  every: 'all',
};

const SUPPORTED_METHODS =
  '.map .filter .reduce .some .every .sort() .slice .join .includes .toFixed ' +
  '.toLowerCase .toUpperCase .trim .split .replace, and the .length property';

function arrowError(src: Source, pos: number): never {
  src.fail(
    'arrow functions are only valid as map/filter/reduce/sortBy/some/every callbacks ' +
      '(e.g. rows.filter(r => r.open))',
    'INVALID_ARROW',
    pos,
  );
}

/** Transpile with parens added when the context demands a tighter level. */
function tp(js: Js, min: number, src: Source): string {
  const [out, level] = tpInner(js, src);
  return level < min ? `(${out})` : out;
}

function tpInner(js: Js, src: Source): [string, number] {
  switch (js.k) {
    case 'lit': {
      if (typeof js.v === 'string') return [q(js.v), L_PRIMARY];
      return [String(js.v), L_PRIMARY];
    }
    case 'ident':
      return [js.name, L_PRIMARY];
    case 'template': {
      const parts: string[] = [];
      for (let i = 0; i < js.quasis.length; i++) {
        const quasi = js.quasis[i];
        if (quasi !== undefined && quasi !== '') parts.push(q(quasi));
        const expr = js.exprs[i];
        if (expr) parts.push(tp(expr, L_COND, src));
      }
      if (parts.length === 0) return [q(''), L_PRIMARY];
      if (parts.length === 1 && js.exprs.length === 0) return [parts[0] as string, L_PRIMARY];
      return [`concat(${parts.join(', ')})`, L_PRIMARY];
    }
    case 'member': {
      if (js.prop === 'length') return [`len(${tp(js.obj, L_COND, src)})`, L_PRIMARY];
      return [`${tp(js.obj, L_POSTFIX, src)}.${js.prop}`, L_POSTFIX];
    }
    case 'index':
      return [`${tp(js.obj, L_POSTFIX, src)}[${tp(js.idx, L_COND, src)}]`, L_POSTFIX];
    case 'unary':
      return [`${js.op}${tp(js.arg, L_UNARY, src)}`, L_UNARY];
    case 'binary': {
      if (js.op === '??') {
        return [`coalesce(${tp(js.left, L_COND, src)}, ${tp(js.right, L_COND, src)})`, L_PRIMARY];
      }
      const op = js.op === '===' ? '==' : js.op === '!==' ? '!=' : js.op;
      const level = BINARY_PREC[op];
      if (level === undefined)
        src.fail(`unsupported operator '${js.op}'`, 'INVALID_EXPRESSION', js.pos);
      return [`${tp(js.left, level, src)} ${op} ${tp(js.right, level + 1, src)}`, level];
    }
    case 'cond':
      return [
        `${tp(js.test, L_OR, src)} ? ${tp(js.then, L_COND, src)} : ${tp(js.else, L_COND, src)}`,
        L_COND,
      ];
    case 'array':
      return [`[${js.items.map((item) => tp(item, L_COND, src)).join(', ')}]`, L_PRIMARY];
    case 'object':
      src.fail(
        'object literals are only valid as literal prop values, not inside expressions',
        'INVALID_EXPRESSION',
        js.pos,
      );
      break;
    case 'arrow':
      arrowError(src, js.pos);
      break;
    case 'element':
      src.fail(
        'an element can only appear as a child: {cond && <El/>}, {cond ? <A/> : <B/>}, or {list.map((x) => <El/>)}',
        'INVALID_CHILD',
        js.pos,
      );
      break;
    case 'call':
      return [tpCall(js, src), L_PRIMARY];
  }
  src.fail('invalid expression', 'INVALID_EXPRESSION', js.pos);
}

function foldFromArrow(
  fn: string,
  listSrc: string,
  arrow: Extract<Js, { k: 'arrow' }>,
  src: Source,
): string {
  if (arrow.params.length !== 1) {
    src.fail(
      `${fn} binds one item parameter (e.g. rows.filter(r => r.open)); expr folds carry no index - for indexed loops use children: {list.map((item, i) => <El/>)}`,
      'INVALID_ARROW',
      arrow.pos,
    );
  }
  return `${fn}(${listSrc}, ${arrow.params[0]}, ${tp(arrow.body, L_COND, src)})`;
}

function tpCall(js: Extract<Js, { k: 'call' }>, src: Source): string {
  const callee = js.callee;

  // method form: x.map(f), x.slice(a, b), x.toFixed(2), …
  if (callee.k === 'member') {
    const objSrc = () => tp(callee.obj, L_COND, src);
    const argSrc = (i: number) => {
      const a = js.args[i];
      if (!a) src.fail(`.${callee.prop}() is missing an argument`, 'INVALID_EXPRESSION', js.pos);
      return tp(a, L_COND, src);
    };
    const fold = METHOD_FOLDS[callee.prop];
    if (fold) {
      const cb = js.args[0];
      if (js.args.length !== 1 || cb?.k !== 'arrow') {
        src.fail(
          `.${callee.prop}() takes one arrow callback (e.g. rows.${callee.prop}(r => r.open))`,
          'INVALID_EXPRESSION',
          js.pos,
        );
      }
      return foldFromArrow(fold, objSrc(), cb, src);
    }
    switch (callee.prop) {
      case 'reduce': {
        const cb = js.args[0];
        if (js.args.length !== 2 || cb?.k !== 'arrow' || cb.params.length !== 2) {
          src.fail('.reduce() takes ((acc, item) => body, init)', 'INVALID_EXPRESSION', js.pos);
        }
        const [acc, item] = cb.params as [string, string];
        return `reduce(${objSrc()}, ${item}, ${acc}, ${tp(cb.body, L_COND, src)}, ${argSrc(1)})`;
      }
      case 'sort':
        if (js.args.length > 0) {
          src.fail(
            'custom comparators are not Mosaic; use .sort() for natural order or sortBy(list, x, key)',
            'INVALID_EXPRESSION',
            js.pos,
          );
        }
        return `sort(${objSrc()})`;
      case 'slice':
        return js.args.length > 1
          ? `slice(${objSrc()}, ${argSrc(0)}, ${argSrc(1)})`
          : `slice(${objSrc()}, ${argSrc(0)})`;
      case 'join':
        return `join(${objSrc()}, ${js.args.length > 0 ? argSrc(0) : q(',')})`;
      case 'includes':
        return `contains(${objSrc()}, ${argSrc(0)})`;
      case 'toFixed':
        return js.args.length > 0 ? `toFixed(${objSrc()}, ${argSrc(0)})` : `toFixed(${objSrc()})`;
      case 'toLowerCase':
        return `lower(${objSrc()})`;
      case 'toUpperCase':
        return `upper(${objSrc()})`;
      case 'trim':
        return `trim(${objSrc()})`;
      case 'split':
        return `split(${objSrc()}, ${argSrc(0)})`;
      case 'replace':
        return `replace(${objSrc()}, ${argSrc(0)}, ${argSrc(1)})`;
      case 'startsWith':
      case 'endsWith':
        src.fail(
          `.${callee.prop}() is not in the Mosaic function catalog; use contains(str, needle)`,
          'UNKNOWN_FUNCTION',
          js.pos,
        );
        break;
      default:
        src.fail(
          `.${callee.prop}() is not a Mosaic method; supported: ${SUPPORTED_METHODS}`,
          'UNKNOWN_FUNCTION',
          js.pos,
        );
    }
  }

  if (callee.k !== 'ident') {
    src.fail('only catalog functions can be called', 'INVALID_EXPRESSION', js.pos);
  }
  const fn = callee.name;
  if (FOLD_FNS.has(fn)) {
    const second = js.args[1];
    // arrow form: filter(rows, r => r.open)
    if (js.args.length === 2 && second?.k === 'arrow') {
      return foldFromArrow(fn, tp(js.args[0] as Js, L_COND, src), second, src);
    }
    // canonical fold form: filter(rows, r, r.open)
    if (js.args.length === 3 && second?.k === 'ident') {
      return `${fn}(${tp(js.args[0] as Js, L_COND, src)}, ${second.name}, ${tp(js.args[2] as Js, L_COND, src)})`;
    }
    src.fail(
      `${fn} takes (list, item => body) or the canonical (list, item, body)`,
      'INVALID_EXPRESSION',
      js.pos,
    );
  }
  if (fn === 'reduce') {
    const second = js.args[1];
    const third = js.args[2];
    // arrow form: reduce(rows, (acc, r) => acc + r.n, 0)
    if (js.args.length === 3 && second?.k === 'arrow' && second.params.length === 2) {
      const [acc, item] = second.params as [string, string];
      return `reduce(${tp(js.args[0] as Js, L_COND, src)}, ${item}, ${acc}, ${tp(second.body, L_COND, src)}, ${tp(js.args[2] as Js, L_COND, src)})`;
    }
    // canonical form: reduce(rows, item, acc, body, init)
    if (js.args.length === 5 && second?.k === 'ident' && third?.k === 'ident') {
      return `reduce(${tp(js.args[0] as Js, L_COND, src)}, ${second.name}, ${third.name}, ${tp(js.args[3] as Js, L_COND, src)}, ${tp(js.args[4] as Js, L_COND, src)})`;
    }
    src.fail(
      'reduce takes (list, (acc, item) => body, init) or the canonical (list, item, acc, body, init)',
      'INVALID_EXPRESSION',
      js.pos,
    );
  }
  if (fn === 'count' && js.args.length === 2 && js.args[1]?.k === 'arrow') {
    // count(rows, r => r.open) -> count(filter(rows, r, r.open))
    return `count(${foldFromArrow('filter', tp(js.args[0] as Js, L_COND, src), js.args[1] as Extract<Js, { k: 'arrow' }>, src)})`;
  }
  if (!FN_SET.has(fn)) {
    src.fail(
      `'${fn}' is not in the Mosaic function catalog; available: ${EXPR_FUNCTIONS.join(', ')}`,
      'UNKNOWN_FUNCTION',
      js.pos,
    );
  }
  return `${fn}(${js.args.map((a) => tp(a, L_COND, src)).join(', ')})`;
}

/** Transpile and assert the output parses in the bounded expr grammar. */
function transpile(js: Js, src: Source): string {
  const out = tp(js, L_COND, src);
  try {
    parseExpr(out);
  } catch (e) {
    src.fail(
      `expression does not fit the Mosaic expr grammar (${e instanceof Error ? e.message : String(e)})`,
      'INVALID_EXPRESSION',
      js.pos,
    );
  }
  return out;
}

/** A bare state path: an ident/member/index chain rooted at an identifier
 *  (`seats`, `filters.region`, `files[i].checked`). */
function isBarePath(js: Js): boolean {
  let node = js;
  while (node.k === 'member' || node.k === 'index') node = node.obj;
  return node.k === 'ident';
}

function pathSource(js: Js, src: Source): string {
  switch (js.k) {
    case 'ident':
      return js.name;
    case 'member':
      return `${pathSource(js.obj, src)}.${js.prop}`;
    case 'index':
      return `${pathSource(js.obj, src)}[${tp(js.idx, L_COND, src)}]`;
    default:
      src.fail('expected a state path', 'INVALID_EXPRESSION', js.pos);
  }
}

/** Compile a brace value in prop position: literal structure stays literal
 *  (expression leaves become { $expr }), anything else transpiles to one
 *  { $expr }. */
function compilePropValue(js: Js, src: Source): PropValue {
  switch (js.k) {
    case 'lit':
      return js.v;
    case 'array':
      return js.items.map((item) => compilePropValue(item, src));
    case 'object': {
      const out: Record<string, PropValue> = {};
      for (const { key, value } of js.entries) out[key] = compilePropValue(value, src);
      return out;
    }
    case 'template':
      if (js.exprs.length === 0) return js.quasis.join('');
      return { $expr: transpile(js, src) } satisfies ExprRef;
    default:
      return { $expr: transpile(js, src) } satisfies ExprRef;
  }
}

function assertLiteral(value: PropValue, src: Source, pos: number): void {
  if (isExprRef(value)) {
    src.fail(
      "state is the artifact's initial data; it must be a literal object (no expressions)",
      'INVALID_STATE',
      pos,
    );
  }
  if (Array.isArray(value)) {
    for (const v of value) assertLiteral(v, src, pos);
  } else if (value !== null && typeof value === 'object') {
    for (const v of Object.values(value)) assertLiteral(v, src, pos);
  }
}

const HANDLER_FORMS =
  'event handlers take an intent name (onClick={save}), an intent with args ' +
  '(onClick={save({ id: 3 })}), set(path, expression), or toggle(path); a ' +
  'zero-parameter arrow wrapping any of these also works';

function handlerPath(js: Js | undefined, fn: string, src: Source, pos: number): string {
  if (!js || !isBarePath(js)) {
    src.fail(
      `${fn}(...) takes a state path (e.g. ${fn === 'set' ? "set(filters.region, 'EU')" : 'toggle(open)'})`,
      'INVALID_HANDLER',
      pos,
    );
  }
  const path = pathSource(js, src);
  if (path.includes("'") || path.includes('"')) {
    src.fail('string keys in set/toggle paths are not supported', 'INVALID_HANDLER', pos);
  }
  return path;
}

function compileHandler(raw: Js, src: Source): ActionRef {
  const js = raw.k === 'arrow' && raw.params.length === 0 ? raw.body : raw;
  if (js.k === 'arrow') {
    src.fail(
      'event handlers take no parameters; unwrap to onClick={intentName({ …args })}',
      'INVALID_HANDLER',
      js.pos,
    );
  }
  if (js.k === 'ident') return js.name;
  if (js.k === 'lit' && typeof js.v === 'string') return js.v;
  if (js.k === 'call') {
    const callee = js.callee;
    const local =
      callee.k === 'ident' && (callee.name === 'set' || callee.name === 'toggle')
        ? callee.name
        : callee.k === 'member' &&
            callee.obj.k === 'ident' &&
            callee.obj.name === 'state' &&
            (callee.prop === 'set' || callee.prop === 'toggle')
          ? callee.prop
          : null;
    if (local === 'set') {
      if (js.args.length !== 2) {
        src.fail('set(...) takes (path, expression)', 'INVALID_HANDLER', js.pos);
      }
      const path = handlerPath(js.args[0], 'set', src, js.pos);
      // The value admits the full bounded expression language; it lands in the
      // IR as a prop value (literal or { $expr }) that resolve() evaluates
      // against current state on every render, so the write is click-time
      // correct: set(count, count + 1) increments from the live count.
      const value = compilePropValue(js.args[1] as Js, src);
      return { action: 'state.set', args: { path, value } };
    }
    if (local === 'toggle') {
      if (js.args.length !== 1) {
        src.fail('toggle(...) takes one state path', 'INVALID_HANDLER', js.pos);
      }
      return {
        action: 'state.toggle',
        args: { path: handlerPath(js.args[0], 'toggle', src, js.pos) },
      };
    }
    if (callee.k === 'ident') {
      if (js.args.length === 0) return callee.name;
      const arg = js.args[0];
      if (js.args.length === 1 && arg?.k === 'object') {
        const args: Record<string, PropValue> = {};
        for (const { key, value } of arg.entries) args[key] = compilePropValue(value, src);
        return { action: callee.name, args };
      }
      src.fail(
        `${callee.name}(...) takes a single { … } object of intent args`,
        'INVALID_HANDLER',
        js.pos,
      );
    }
  }
  src.fail(HANDLER_FORMS, 'INVALID_HANDLER', js.pos);
}

/** Blocks whose value/checked prop two-way binds when given a bare state path:
 *  controls and structure switches, plus Diagram (selection binding). */
function isBindable(tag: string): boolean {
  if (tag === 'Diagram') return true;
  const kind = defaultBlock(tag)?.kind;
  return kind === 'control' || kind === 'structure';
}

const LEGACY_DIRECTIVE_HINTS: Record<string, string> = {
  'bind:state': 'two-way bind by writing value={path} (or checked={path}) on the control',
  'if:show': 'write the conditional as a child: {cond && <El … />}',
  'for:each': 'write the loop as a child: {list.map((item) => <El … />)}',
  'on:event': 'write onClick={intentName({ …args })} (or onSelect, …)',
  'from:state': 'write value={path} instead',
  'from:expr': 'write value={expression} instead',
};

function readName(src: Source): string {
  let out = '';
  while (/[A-Za-z0-9]/.test(src.at())) {
    out += src.at();
    src.pos++;
  }
  return out;
}

function readAttrName(src: Source): string {
  let out = '';
  while (/[A-Za-z0-9:_-]/.test(src.at())) {
    out += src.at();
    src.pos++;
  }
  return out;
}

/** Text run until '<' or '{'. Whitespace is insignificant: runs collapse to
 *  single spaces and pure-whitespace runs between elements vanish. */
function readText(src: Source): string | null {
  let out = '';
  while (src.pos < src.text.length && src.at() !== '<' && src.at() !== '{') {
    out += src.at();
    src.pos++;
  }
  const trimmed = out.replace(/\s+/g, ' ').trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readString(src: Source): string {
  const quote = src.at();
  const start = src.pos;
  src.pos++;
  let out = '';
  while (src.pos < src.text.length && src.at() !== quote) {
    if (src.at() === '\\') {
      const esc = src.at(1);
      if (esc === 'n') out += '\n';
      else if (esc === 't') out += '\t';
      else if (esc === '\\' || esc === '"' || esc === "'" || esc === '`') out += esc;
      else src.fail(`invalid escape \\${esc}`, 'INVALID_ESCAPE');
      src.pos += 2;
    } else {
      out += src.at();
      src.pos++;
    }
  }
  if (src.pos >= src.text.length) src.fail('unterminated string', 'UNTERMINATED_STRING', start);
  src.pos++;
  return out;
}

function readNumber(src: Source): number {
  const m = /^[0-9]*\.?[0-9]+(?:[eE][+-]?[0-9]+)?/.exec(src.text.slice(src.pos));
  if (!m) src.fail('invalid number', 'INVALID_EXPRESSION');
  src.pos += m[0].length;
  return Number(m[0]);
}

type AttrValue = { form: 'string'; value: string } | { form: 'expr'; js: Js } | { form: 'bare' };

function parseAttrValue(src: Source): AttrValue {
  src.skipWs();
  if (src.at() !== '=') return { form: 'bare' };
  src.pos++;
  src.skipWs();
  if (src.at() === '"' || src.at() === "'") return { form: 'string', value: readString(src) };
  if (src.at() === '{') {
    const start = src.pos;
    src.pos++;
    const js = parseJs(src, false);
    skipExprWs(src);
    if (src.at() !== '}') {
      if (src.at() === ',') {
        src.fail("unexpected ','; braces hold a single expression", 'INVALID_EXPRESSION');
      }
      src.fail("expected '}'", 'EXPECTED_BRACE', start);
    }
    src.pos++;
    return { form: 'expr', js };
  }
  if (src.at() === '`') {
    src.fail('template literals go inside braces: label={`…`}', 'EXPECTED_VALUE');
  }
  src.fail('expected "…" or {…}', 'EXPECTED_VALUE');
}

function parseElement(src: Source): MosaicNode {
  const start = src.pos;
  src.pos++; // '<'
  if (src.at() === '>') {
    src.fail('fragments (<>…</>) are not Mosaic; wrap siblings in a <Stack>', 'FRAGMENT', start);
  }
  const tag = readName(src);
  if (!tag) src.fail('expected a tag name', 'EXPECTED_TAG', start);
  if (!/^[A-Z]/.test(tag)) {
    src.fail(
      `<${tag}> is not a Mosaic block; blocks are PascalCase (<Text>, <Stack>, <Card>, …) - there is no HTML here`,
      'LOWERCASE_TAG',
      start,
    );
  }

  const props: Record<string, PropValue> = {};
  const directives: Directives = {};
  const events: Record<string, ActionRef> = {};

  const assignAttr = (name: string, attrStart: number): void => {
    if (name === 'class' || name === 'className' || name === 'style') {
      src.fail(
        `'${name}' is not Mosaic; the host owns styling - use semantic props like tone instead`,
        'FORBIDDEN_ATTRIBUTE',
        attrStart,
      );
    }
    if (name.includes(':')) {
      const hint = LEGACY_DIRECTIVE_HINTS[name];
      src.fail(
        hint ? `'${name}' is not an attribute; ${hint}` : `'${name}' is not a Mosaic attribute`,
        'LEGACY_DIRECTIVE',
        attrStart,
      );
    }
    const value = parseAttrValue(src);

    if (/^on[A-Z]/.test(name)) {
      if (value.form !== 'expr') {
        src.fail(
          `${name} takes a handler in braces; ${HANDLER_FORMS}`,
          'INVALID_HANDLER',
          attrStart,
        );
      }
      const event = name.charAt(2).toLowerCase() + name.slice(3);
      events[event] = compileHandler(value.js, src);
      return;
    }
    if (name === 'key') {
      if (value.form === 'string') {
        directives.key = value.value;
      } else if (value.form === 'bare') {
        src.fail('key takes a value: key="…" or key={…}', 'INVALID_KEY', attrStart);
      } else if (value.js.k === 'lit') {
        directives.key = String(value.js.v);
      } else {
        directives.key = { $expr: transpile(value.js, src) };
      }
      return;
    }
    if ((name === 'value' || name === 'checked') && value.form === 'expr' && isBindable(tag)) {
      const js = value.js;
      if (js.k !== 'lit' && isBarePath(js)) {
        directives['bind:state'] = pathSource(js, src);
        return;
      }
    }
    if (value.form === 'bare') {
      props[name] = true;
      return;
    }
    if (value.form === 'string') {
      props[name] = value.value;
      return;
    }
    const compiled = compilePropValue(value.js, src);
    if (name === 'state') {
      if (value.js.k !== 'object') {
        src.fail(
          'state takes a literal object: state={{ key: value }}',
          'INVALID_STATE',
          attrStart,
        );
      }
      assertLiteral(compiled, src, attrStart);
    }
    props[name] = compiled;
  };

  for (;;) {
    src.skipWs();
    if (src.startsWith('/>')) {
      src.pos += 2;
      return build(tag, props, directives, events, []);
    }
    if (src.at() === '>') {
      src.pos++;
      break;
    }
    if (src.pos >= src.text.length) src.fail(`unterminated <${tag}>`, 'UNTERMINATED_TAG', start);

    const attrStart = src.pos;
    const name = readAttrName(src);
    if (!name) src.fail('expected an attribute', 'EXPECTED_ATTRIBUTE');
    assignAttr(name, attrStart);
  }

  // children
  const children: MosaicNode[] = [];
  for (;;) {
    const textStart = src.pos;
    const text = readText(src);
    if (text) children.push(textNode(text));
    if (src.pos >= src.text.length) {
      src.fail(`unterminated <${tag}>: missing </${tag}>`, 'UNTERMINATED_TAG', textStart);
    }
    if (src.startsWith('</')) {
      src.pos += 2;
      const closing = readName(src);
      src.skipWs();
      if (src.at() !== '>') src.fail('expected >', 'EXPECTED_GT');
      src.pos++;
      if (closing !== tag) {
        src.fail(`expected </${tag}>, found </${closing}>`, 'MISMATCHED_TAG');
      }
      return build(tag, props, directives, events, children);
    }
    if (src.at() === '<') {
      children.push(parseElement(src));
      continue;
    }
    if (src.at() === '{') {
      if (src.startsWith('{/*')) {
        src.skipWsAndComments();
        continue;
      }
      const braceStart = src.pos;
      src.pos++;
      skipExprWs(src);
      if (src.at() === '}') src.fail('empty braces', 'INVALID_CHILD', braceStart);
      const js = parseJs(src, true);
      skipExprWs(src);
      if (src.at() !== '}') {
        if (src.at() === ',') {
          src.fail("unexpected ','; braces hold a single expression", 'INVALID_EXPRESSION');
        }
        src.fail("expected '}'", 'EXPECTED_BRACE', braceStart);
      }
      src.pos++;
      compileChild(js, children, src);
    }
  }
}

/** Lower a brace child: an element, a conditional over elements, a .map loop,
 *  or a scalar expression (a text node). */
function compileChild(js: Js, children: MosaicNode[], src: Source): void {
  // {<El/>}
  if (js.k === 'element') {
    children.push(js.node);
    return;
  }
  // {cond && <El/>}
  if (js.k === 'binary' && js.op === '&&' && js.right.k === 'element') {
    const node = js.right.node;
    setDirective(node, 'if:show', transpile(js.left, src));
    children.push(node);
    return;
  }
  // {cond ? <A/> : <B/>} - either branch may be null
  if (js.k === 'cond' && (js.then.k === 'element' || js.else.k === 'element')) {
    const cond = transpile(js.test, src);
    const branch = (side: Js, negated: boolean): void => {
      if (side.k === 'element') {
        const shown = negated
          ? transpile({ k: 'unary', op: '!', arg: js.test, pos: js.pos }, src)
          : cond;
        setDirective(side.node, 'if:show', shown);
        children.push(side.node);
        return;
      }
      if (side.k === 'lit' && side.v === null) return;
      src.fail(
        'ternary children take elements (or null) on both branches',
        'INVALID_CHILD',
        side.pos,
      );
    };
    branch(js.then, false);
    branch(js.else, true);
    return;
  }
  // {list.map((item) => <El/>)} / {list.map((item, i) => <El/>)}
  if (
    js.k === 'call' &&
    js.callee.k === 'member' &&
    js.callee.prop === 'map' &&
    js.args.length === 1 &&
    js.args[0]?.k === 'arrow'
  ) {
    const arrow = js.args[0] as Extract<Js, { k: 'arrow' }>;
    let body = arrow.body;
    let shown: string | undefined;
    if (body.k === 'binary' && body.op === '&&' && body.right.k === 'element') {
      shown = transpile(body.left, src);
      body = body.right;
    }
    if (body.k === 'element') {
      if (arrow.params.length < 1 || arrow.params.length > 2) {
        src.fail('map callbacks bind (item) or (item, i)', 'INVALID_CHILD', arrow.pos);
      }
      const listSrc = transpile(js.callee.obj, src);
      const binding =
        arrow.params.length === 2
          ? `${listSrc} as ${arrow.params[0]}, ${arrow.params[1]}`
          : `${listSrc} as ${arrow.params[0]}`;
      const node = body.node;
      setDirective(node, 'for:each', binding);
      if (shown !== undefined) setDirective(node, 'if:show', shown);
      children.push(node);
      return;
    }
    src.fail(
      'map children must return an element (wrap row content in a block like <Stack>)',
      'INVALID_CHILD',
      arrow.pos,
    );
  }
  // scalar expression or literal -> a text node
  if (js.k === 'lit') {
    if (js.v !== null) children.push(textNode(String(js.v)));
    return;
  }
  children.push(textNode({ $expr: transpile(js, src) }));
}

function setDirective(node: MosaicNode, name: 'if:show' | 'for:each', value: string): void {
  node.directives = { ...(node.directives ?? {}), [name]: value };
}

function build(
  tag: string,
  props: Record<string, PropValue>,
  directives: Directives,
  events: Record<string, ActionRef>,
  children: MosaicNode[],
): MosaicNode {
  if (Object.keys(events).length > 0) directives['on:event'] = events;
  const node: MosaicNode = { type: tag };
  if (Object.keys(props).length > 0) node.props = props;
  if (Object.keys(directives).length > 0) node.directives = directives;
  if (children.length > 0) node.children = children;
  return node;
}

/** Parse mosaic-jsx source (without a fence) into a MosaicNode tree.
 *  Throws JsxError on any syntax or expression error. */
export function parseJsx(source: string): MosaicNode {
  const src = new Source(source);
  src.skipWsAndComments();
  if (src.at() !== '<') src.fail('expected an element', 'EXPECTED_ELEMENT');
  const root = parseElement(src);
  src.skipWsAndComments();
  if (src.pos < src.text.length) {
    src.fail('content after the root element', 'TRAILING_CONTENT');
  }
  return root;
}
