// expr — the bounded, CEL-class expression language (docs/proposal.md §6.2).
//
// AST-interpreted, never eval'd. Non-Turing-complete by construction: no
// assignment, no user functions, no recursion, no loops, no I/O. A static
// parse-time cost bound rejects oversized expressions and a runtime step
// budget backstops evaluation.

import type { JsonLiteral } from './ast.js';

export type ExprValue = JsonLiteral;

export class ExprError extends Error {
  readonly position: number;
  constructor(message: string, position = 0) {
    super(message);
    this.name = 'ExprError';
    this.position = position;
  }
}

// --- limits ---------------------------------------------------------------

/** Maximum AST nodes an expression may parse to (static cost bound). */
export const MAX_EXPR_NODES = 500;
/** Maximum interpreter steps per evaluation (runtime backstop). */
export const MAX_EXPR_STEPS = 100_000;
/** Maximum string length a string function will produce. */
const MAX_STRING = 100_000;

// --- AST ------------------------------------------------------------------

type Ast =
  | { t: 'lit'; v: string | number | boolean | null }
  | { t: 'list'; items: Ast[] }
  | { t: 'ident'; name: string }
  | { t: 'member'; obj: Ast; prop: string }
  | { t: 'index'; obj: Ast; idx: Ast }
  | { t: 'unary'; op: '!' | '-'; arg: Ast }
  | { t: 'binary'; op: string; left: Ast; right: Ast }
  | { t: 'cond'; test: Ast; then: Ast; else: Ast }
  | { t: 'call'; fn: string; args: Ast[]; lambda?: { param: string; body: Ast; extra?: string } };

// --- tokenizer --------------------------------------------------------------

type Token = { kind: 'num' | 'str' | 'ident' | 'op'; value: string; pos: number };

const OPS = [
  '&&',
  '||',
  '==',
  '!=',
  '<=',
  '>=',
  '(',
  ')',
  '[',
  ']',
  ',',
  '.',
  '+',
  '-',
  '*',
  '/',
  '%',
  '<',
  '>',
  '!',
  '?',
  ':',
] as const;

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i] as string;
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      const m = /^[0-9]*\.?[0-9]+(?:[eE][+-]?[0-9]+)?/.exec(src.slice(i));
      if (!m) throw new ExprError(`invalid number at ${i}`, i);
      tokens.push({ kind: 'num', value: m[0], pos: i });
      i += m[0].length;
      continue;
    }
    if (c === '"' || c === "'") {
      const quote = c;
      let j = i + 1;
      let out = '';
      while (j < src.length && src[j] !== quote) {
        if (src[j] === '\\') {
          const esc = src[j + 1];
          if (esc === 'n') out += '\n';
          else if (esc === 't') out += '\t';
          else if (esc === '\\' || esc === quote) out += esc;
          else throw new ExprError(`invalid escape \\${esc ?? ''} at ${j}`, j);
          j += 2;
        } else {
          out += src[j];
          j++;
        }
      }
      if (j >= src.length) throw new ExprError(`unterminated string at ${i}`, i);
      tokens.push({ kind: 'str', value: out, pos: i });
      i = j + 1;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i)) as RegExpExecArray;
      tokens.push({ kind: 'ident', value: m[0], pos: i });
      i += m[0].length;
      continue;
    }
    const two = src.slice(i, i + 2);
    const op = OPS.find((o) => o === two) ?? OPS.find((o) => o === c);
    if (!op) throw new ExprError(`unexpected character '${c}' at ${i}`, i);
    tokens.push({ kind: 'op', value: op, pos: i });
    i += op.length;
  }
  return tokens;
}

// --- function catalog -------------------------------------------------------

/** Functions whose trailing argument is an unevaluated body over a bound item. */
const LAMBDA_FNS = new Set(['map', 'filter', 'any', 'all', 'sortBy', 'reduce']);

export const EXPR_FUNCTIONS = [
  // math
  'abs',
  'min',
  'max',
  'round',
  'floor',
  'ceil',
  'clamp',
  // string
  'len',
  'lower',
  'upper',
  'trim',
  'concat',
  'substr',
  'replace',
  'split',
  'join',
  'contains',
  // format
  'formatCurrency',
  'formatNumber',
  'toFixed',
  // array folds (bounded: they iterate materialized arrays only)
  'map',
  'filter',
  'reduce',
  'sum',
  'count',
  'any',
  'all',
  'sort',
  'sortBy',
  'slice',
  // misc
  'has',
  'coalesce',
] as const;

const FUNCTION_SET = new Set<string>(EXPR_FUNCTIONS);

// --- parser (Pratt) --------------------------------------------------------

class Parser {
  private readonly tokens: Token[];
  private i = 0;
  nodeCount = 0;

  constructor(src: string) {
    this.tokens = tokenize(src);
  }

  private peek(): Token | undefined {
    return this.tokens[this.i];
  }

  private next(): Token {
    const t = this.tokens[this.i++];
    if (!t) throw new ExprError('unexpected end of expression');
    return t;
  }

  private expectOp(value: string): void {
    const t = this.next();
    if (t.kind !== 'op' || t.value !== value) {
      throw new ExprError(`expected '${value}' at ${t.pos}`, t.pos);
    }
  }

  private count(): void {
    this.nodeCount++;
    if (this.nodeCount > MAX_EXPR_NODES) {
      throw new ExprError(`expression exceeds the static cost bound (${MAX_EXPR_NODES} nodes)`);
    }
  }

  parse(): Ast {
    const ast = this.ternary();
    const rest = this.peek();
    if (rest) throw new ExprError(`unexpected '${rest.value}' at ${rest.pos}`, rest.pos);
    return ast;
  }

  private ternary(): Ast {
    const test = this.or();
    const t = this.peek();
    if (t?.kind === 'op' && t.value === '?') {
      this.next();
      const then = this.ternary();
      this.expectOp(':');
      const alt = this.ternary();
      this.count();
      return { t: 'cond', test, then, else: alt };
    }
    return test;
  }

  private binaryLevel(ops: string[], next: () => Ast): Ast {
    let left = next();
    for (;;) {
      const t = this.peek();
      const isIn = t?.kind === 'ident' && t.value === 'in' && ops.includes('in');
      if (!isIn && !(t?.kind === 'op' && ops.includes(t.value))) return left;
      const op = this.next().value;
      const right = next();
      this.count();
      left = { t: 'binary', op, left, right };
    }
  }

  private or(): Ast {
    return this.binaryLevel(['||'], () => this.and());
  }
  private and(): Ast {
    return this.binaryLevel(['&&'], () => this.equality());
  }
  private equality(): Ast {
    return this.binaryLevel(['==', '!='], () => this.relational());
  }
  private relational(): Ast {
    return this.binaryLevel(['<', '<=', '>', '>=', 'in'], () => this.additive());
  }
  private additive(): Ast {
    return this.binaryLevel(['+', '-'], () => this.multiplicative());
  }
  private multiplicative(): Ast {
    return this.binaryLevel(['*', '/', '%'], () => this.unary());
  }

  private unary(): Ast {
    const t = this.peek();
    if (t?.kind === 'op' && (t.value === '!' || t.value === '-')) {
      this.next();
      this.count();
      return { t: 'unary', op: t.value, arg: this.unary() };
    }
    return this.postfix();
  }

  private postfix(): Ast {
    let base = this.primary();
    for (;;) {
      const t = this.peek();
      if (t?.kind === 'op' && t.value === '.') {
        this.next();
        const prop = this.next();
        if (prop.kind !== 'ident') {
          throw new ExprError(`expected property name at ${prop.pos}`, prop.pos);
        }
        this.count();
        base = { t: 'member', obj: base, prop: prop.value };
        const call = this.peek();
        if (call?.kind === 'op' && call.value === '(') {
          throw new ExprError(`method calls are not allowed (at ${call.pos})`, call.pos);
        }
        continue;
      }
      if (t?.kind === 'op' && t.value === '[') {
        this.next();
        const idx = this.ternary();
        this.expectOp(']');
        this.count();
        base = { t: 'index', obj: base, idx };
        continue;
      }
      return base;
    }
  }

  private primary(): Ast {
    const t = this.next();
    this.count();
    if (t.kind === 'num') return { t: 'lit', v: Number(t.value) };
    if (t.kind === 'str') return { t: 'lit', v: t.value };
    if (t.kind === 'ident') {
      if (t.value === 'true') return { t: 'lit', v: true };
      if (t.value === 'false') return { t: 'lit', v: false };
      if (t.value === 'null') return { t: 'lit', v: null };
      const paren = this.peek();
      if (paren?.kind === 'op' && paren.value === '(') {
        return this.call(t);
      }
      return { t: 'ident', name: t.value };
    }
    if (t.kind === 'op' && t.value === '(') {
      const inner = this.ternary();
      this.expectOp(')');
      return inner;
    }
    if (t.kind === 'op' && t.value === '[') {
      const items: Ast[] = [];
      for (;;) {
        const peeked = this.peek();
        if (peeked?.kind === 'op' && peeked.value === ']') {
          this.next();
          break;
        }
        items.push(this.ternary());
        const sep = this.peek();
        if (sep?.kind === 'op' && sep.value === ',') {
          this.next();
          continue;
        }
        this.expectOp(']');
        break;
      }
      return { t: 'list', items };
    }
    throw new ExprError(`unexpected '${t.value}' at ${t.pos}`, t.pos);
  }

  private call(fnTok: Token): Ast {
    if (!FUNCTION_SET.has(fnTok.value)) {
      throw new ExprError(`unknown function '${fnTok.value}' at ${fnTok.pos}`, fnTok.pos);
    }
    this.expectOp('(');
    const args: Ast[] = [];
    let lambda: { param: string; body: Ast; extra?: string } | undefined;
    const isLambdaFn = LAMBDA_FNS.has(fnTok.value);

    const closed = () => {
      const t = this.peek();
      return t?.kind === 'op' && t.value === ')';
    };

    if (!closed()) {
      // First argument is always an ordinary expression (the array for folds).
      args.push(this.ternary());
      if (isLambdaFn) {
        // fold form: fn(arr, item, body) — reduce adds an accumulator:
        // reduce(arr, item, acc, body, init)
        this.expectOp(',');
        const param = this.next();
        if (param.kind !== 'ident') {
          throw new ExprError(`expected item name at ${param.pos}`, param.pos);
        }
        if (fnTok.value === 'reduce') {
          this.expectOp(',');
          const acc = this.next();
          if (acc.kind !== 'ident') {
            throw new ExprError(`expected accumulator name at ${acc.pos}`, acc.pos);
          }
          this.expectOp(',');
          const body = this.ternary();
          this.expectOp(',');
          args.push(this.ternary()); // init
          lambda = { param: param.value, body, extra: acc.value };
        } else {
          this.expectOp(',');
          lambda = { param: param.value, body: this.ternary() };
        }
      } else {
        while (!closed()) {
          this.expectOp(',');
          args.push(this.ternary());
        }
      }
    }
    this.expectOp(')');
    this.count();
    return { t: 'call', fn: fnTok.value, args, lambda };
  }
}

const astCache = new Map<string, Ast>();

export function parseExpr(source: string): void {
  compile(source);
}

function compile(source: string): Ast {
  const cached = astCache.get(source);
  if (cached) return cached;
  const ast = new Parser(source).parse();
  if (astCache.size > 1000) astCache.clear();
  astCache.set(source, ast);
  return ast;
}

/** The root identifiers an expression reads — its dependency set. */
export function exprDependencies(source: string): string[] {
  const deps = new Set<string>();
  const visit = (ast: Ast, bound: Set<string>): void => {
    switch (ast.t) {
      case 'ident':
        if (!bound.has(ast.name)) deps.add(ast.name);
        return;
      case 'member':
        visit(ast.obj, bound);
        return;
      case 'index':
        visit(ast.obj, bound);
        visit(ast.idx, bound);
        return;
      case 'unary':
        visit(ast.arg, bound);
        return;
      case 'binary':
        visit(ast.left, bound);
        visit(ast.right, bound);
        return;
      case 'cond':
        visit(ast.test, bound);
        visit(ast.then, bound);
        visit(ast.else, bound);
        return;
      case 'call': {
        for (const a of ast.args) visit(a, bound);
        if (ast.lambda) {
          const inner = new Set(bound);
          inner.add(ast.lambda.param);
          if (ast.lambda.extra) inner.add(ast.lambda.extra);
          visit(ast.lambda.body, inner);
        }
        return;
      }
      case 'list':
        for (const item of ast.items) visit(item, bound);
        return;
      case 'lit':
        return;
    }
  };
  visit(compile(source), new Set());
  return [...deps];
}

// --- interpreter -------------------------------------------------------------

type Scope = Record<string, ExprValue>;

class Interpreter {
  private steps = 0;

  private step(): void {
    this.steps++;
    if (this.steps > MAX_EXPR_STEPS) {
      throw new ExprError(`evaluation exceeded the step budget (${MAX_EXPR_STEPS})`);
    }
  }

  eval(ast: Ast, scope: Scope): ExprValue {
    this.step();
    switch (ast.t) {
      case 'lit':
        return ast.v;
      case 'list':
        return ast.items.map((item) => this.eval(item, scope));
      case 'ident': {
        if (!(ast.name in scope)) return null;
        return scope[ast.name] ?? null;
      }
      case 'member': {
        const obj = this.eval(ast.obj, scope);
        if (obj !== null && typeof obj === 'object' && !Array.isArray(obj)) {
          return obj[ast.prop] ?? null;
        }
        return null;
      }
      case 'index': {
        const obj = this.eval(ast.obj, scope);
        const idx = this.eval(ast.idx, scope);
        if (Array.isArray(obj) && typeof idx === 'number') return obj[idx] ?? null;
        if (
          obj !== null &&
          typeof obj === 'object' &&
          !Array.isArray(obj) &&
          typeof idx === 'string'
        ) {
          return obj[idx] ?? null;
        }
        return null;
      }
      case 'unary': {
        const v = this.eval(ast.arg, scope);
        if (ast.op === '!') return !truthy(v);
        return -num(v);
      }
      case 'binary':
        return this.binary(ast, scope);
      case 'cond':
        return truthy(this.eval(ast.test, scope))
          ? this.eval(ast.then, scope)
          : this.eval(ast.else, scope);
      case 'call':
        return this.call(ast, scope);
    }
  }

  private binary(ast: Extract<Ast, { t: 'binary' }>, scope: Scope): ExprValue {
    if (ast.op === '&&') {
      const l = this.eval(ast.left, scope);
      return truthy(l) ? this.eval(ast.right, scope) : l;
    }
    if (ast.op === '||') {
      const l = this.eval(ast.left, scope);
      return truthy(l) ? l : this.eval(ast.right, scope);
    }
    const l = this.eval(ast.left, scope);
    const r = this.eval(ast.right, scope);
    switch (ast.op) {
      case '+': {
        if (typeof l === 'string' || typeof r === 'string') {
          const s = str(l) + str(r);
          if (s.length > MAX_STRING) throw new ExprError('string result too large');
          return s;
        }
        return num(l) + num(r);
      }
      case '-':
        return num(l) - num(r);
      case '*':
        return num(l) * num(r);
      case '/':
        return num(l) / num(r);
      case '%':
        return num(l) % num(r);
      case '==':
        return deepEqual(l, r);
      case '!=':
        return !deepEqual(l, r);
      case '<':
        return cmp(l, r) < 0;
      case '<=':
        return cmp(l, r) <= 0;
      case '>':
        return cmp(l, r) > 0;
      case '>=':
        return cmp(l, r) >= 0;
      case 'in': {
        if (Array.isArray(r)) return r.some((x) => deepEqual(x, l));
        if (r !== null && typeof r === 'object') return typeof l === 'string' && l in r;
        if (typeof r === 'string') return typeof l === 'string' && r.includes(l);
        return false;
      }
      default:
        throw new ExprError(`unknown operator '${ast.op}'`);
    }
  }

  private call(ast: Extract<Ast, { t: 'call' }>, scope: Scope): ExprValue {
    const evalArg = (i: number): ExprValue => {
      const a = ast.args[i];
      return a === undefined ? null : this.eval(a, scope);
    };
    const perItem = (item: ExprValue, extra?: Record<string, ExprValue>): ExprValue => {
      const lambda = ast.lambda;
      if (!lambda) throw new ExprError(`${ast.fn} needs an item expression`);
      this.step();
      return this.eval(lambda.body, { ...scope, [lambda.param]: item, ...extra });
    };
    const arr = (): ExprValue[] => {
      const v = evalArg(0);
      if (!Array.isArray(v)) return [];
      return v;
    };

    switch (ast.fn) {
      // math
      case 'abs':
        return Math.abs(num(evalArg(0)));
      case 'min':
        return Math.min(...ast.args.map((_, i) => num(evalArg(i))));
      case 'max':
        return Math.max(...ast.args.map((_, i) => num(evalArg(i))));
      case 'round':
        return Math.round(num(evalArg(0)));
      case 'floor':
        return Math.floor(num(evalArg(0)));
      case 'ceil':
        return Math.ceil(num(evalArg(0)));
      case 'clamp': {
        const v = num(evalArg(0));
        return Math.min(Math.max(v, num(evalArg(1))), num(evalArg(2)));
      }
      // string
      case 'len': {
        const v = evalArg(0);
        if (typeof v === 'string') return v.length;
        if (Array.isArray(v)) return v.length;
        return 0;
      }
      case 'lower':
        return str(evalArg(0)).toLowerCase();
      case 'upper':
        return str(evalArg(0)).toUpperCase();
      case 'trim':
        return str(evalArg(0)).trim();
      case 'concat': {
        const s = ast.args.map((_, i) => str(evalArg(i))).join('');
        if (s.length > MAX_STRING) throw new ExprError('string result too large');
        return s;
      }
      case 'substr':
        return str(evalArg(0)).slice(
          num(evalArg(1)),
          ast.args.length > 2 ? num(evalArg(2)) : undefined,
        );
      case 'replace':
        return str(evalArg(0))
          .split(str(evalArg(1)))
          .join(str(evalArg(2)));
      case 'split':
        return str(evalArg(0)).split(str(evalArg(1)));
      case 'join':
        return arr()
          .map(str)
          .join(str(evalArg(1)));
      case 'contains': {
        const hay = evalArg(0);
        const needle = evalArg(1);
        if (typeof hay === 'string') return hay.includes(str(needle));
        if (Array.isArray(hay)) return hay.some((x) => deepEqual(x, needle));
        return false;
      }
      // format
      case 'formatCurrency': {
        const v = num(evalArg(0));
        const currency = ast.args.length > 1 ? str(evalArg(1)) : 'USD';
        return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(v);
      }
      case 'formatNumber':
        return new Intl.NumberFormat('en-US').format(num(evalArg(0)));
      case 'toFixed':
        return num(evalArg(0)).toFixed(ast.args.length > 1 ? num(evalArg(1)) : 0);
      // array folds
      case 'map':
        return arr().map((x) => perItem(x));
      case 'filter':
        return arr().filter((x) => truthy(perItem(x)));
      case 'any':
        return arr().some((x) => truthy(perItem(x)));
      case 'all':
        return arr().every((x) => truthy(perItem(x)));
      case 'reduce': {
        const lambda = ast.lambda;
        if (!lambda?.extra) throw new ExprError('reduce needs (arr, item, acc, body, init)');
        let acc = evalArg(1); // init parsed as second plain arg
        for (const item of arr()) {
          this.step();
          acc = this.eval(lambda.body, { ...scope, [lambda.param]: item, [lambda.extra]: acc });
        }
        return acc;
      }
      case 'sum': {
        let total = 0;
        for (const x of arr()) {
          this.step();
          total += num(x);
        }
        return total;
      }
      case 'count':
        return arr().length;
      case 'sort':
        return [...arr()].sort(cmp);
      case 'sortBy':
        return [...arr()]
          .map((x) => ({ x, k: perItem(x) }))
          .sort((a, b) => cmp(a.k, b.k))
          .map((p) => p.x);
      case 'slice':
        return arr().slice(num(evalArg(1)), ast.args.length > 2 ? num(evalArg(2)) : undefined);
      // misc
      case 'has': {
        const obj = evalArg(0);
        const k = evalArg(1);
        if (obj !== null && typeof obj === 'object' && !Array.isArray(obj)) {
          return typeof k === 'string' && k in obj;
        }
        return false;
      }
      case 'coalesce': {
        for (let i = 0; i < ast.args.length; i++) {
          const v = evalArg(i);
          if (v !== null) return v;
        }
        return null;
      }
      default:
        throw new ExprError(`unknown function '${ast.fn}'`);
    }
  }
}

function truthy(v: ExprValue): boolean {
  if (v === null) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return true;
  return Boolean(v);
}

function num(v: ExprValue): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isNaN(n) ? 0 : n;
  }
  return 0;
}

function str(v: ExprValue): string {
  if (v === null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function deepEqual(a: ExprValue, b: ExprValue): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => deepEqual(x, b[i] ?? null));
  }
  if (a !== null && b !== null && typeof a === 'object' && typeof b === 'object') {
    if (Array.isArray(a) || Array.isArray(b)) return false;
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => deepEqual(a[k] ?? null, b[k] ?? null));
  }
  return false;
}

function cmp(a: ExprValue, b: ExprValue): number {
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
  const na = num(a);
  const nb = num(b);
  return na < nb ? -1 : na > nb ? 1 : 0;
}

/** Evaluate an expr(...) source against a state scope. AST-interpreted, never
 *  eval'd; non-Turing-complete, terminating, side-effect-free. */
export function evalExpr(source: string, scope: Record<string, ExprValue>): ExprValue {
  return new Interpreter().eval(compile(source), scope);
}

/** Format an expr result for text display. */
export function displayValue(v: ExprValue): string {
  return str(v);
}
