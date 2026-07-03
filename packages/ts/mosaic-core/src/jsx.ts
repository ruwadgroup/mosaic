// The Mosaic compiler: the strict JSX subset -> IR (docs/proposal.md §5.1).
//
// Compile-time safety is structural: braces admit only JSON-compatible literals
// plus the two interpreted calls token("…") and expr("…"). Arrow functions,
// identifiers, member access, template literals, and lowercase HTML tags are
// rejected here, before anything else sees the artifact.

import {
  type ActionRef,
  DIRECTIVE_NAMES,
  type Directives,
  type ExprRef,
  type MosaicNode,
  type PropValue,
  isExprRef,
  textNode,
} from './ast.js';

export type ParseError = { line: number; column: number; message: string; code: string };

export class JsxError extends Error {
  readonly errors: ParseError[];
  constructor(errors: ParseError[]) {
    super(errors.map((e) => `${e.line}:${e.column} ${e.code}: ${e.message}`).join('\n'));
    this.name = 'JsxError';
    this.errors = errors;
  }
}

const DIRECTIVES = new Set<string>(DIRECTIVE_NAMES);

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

function parseElement(src: Source): MosaicNode {
  const start = src.pos;
  src.pos++; // '<'
  const tag = readName(src);
  if (!tag) src.fail('expected a tag name', 'EXPECTED_TAG', start);
  if (!/^[A-Z]/.test(tag)) {
    src.fail(`lowercase tag <${tag}> is not Mosaic; blocks are PascalCase`, 'LOWERCASE_TAG', start);
  }

  const props: Record<string, PropValue> = {};
  const directives: Directives = {};
  let hasProps = false;
  let hasDirectives = false;

  for (;;) {
    src.skipWs();
    if (src.startsWith('/>')) {
      src.pos += 2;
      return build(tag, props, directives, [], hasProps, hasDirectives);
    }
    if (src.at() === '>') {
      src.pos++;
      break;
    }
    if (src.pos >= src.text.length) src.fail(`unterminated <${tag}>`, 'UNTERMINATED_TAG', start);

    const attrStart = src.pos;
    const name = readAttrName(src);
    if (!name) src.fail('expected an attribute', 'EXPECTED_ATTRIBUTE');
    if (name === 'class' || name === 'className' || name === 'style') {
      src.fail(
        `'${name}' is not Mosaic; styling comes from the host`,
        'FORBIDDEN_ATTRIBUTE',
        attrStart,
      );
    }
    src.skipWs();
    let value: PropValue = true;
    if (src.at() === '=') {
      src.pos++;
      src.skipWs();
      value = parseAttrValue(src);
    }
    if (DIRECTIVES.has(name)) {
      assignDirective(src, directives, name, value, attrStart);
      hasDirectives = true;
    } else {
      props[name] = value;
      hasProps = true;
    }
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
      return build(tag, props, directives, children, hasProps, hasDirectives);
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
      src.skipWs();
      const value = parseBraceLiteral(src);
      src.skipWs();
      if (src.at() !== '}') src.fail('expected }', 'EXPECTED_BRACE', braceStart);
      src.pos++;
      if (isExprRef(value)) {
        children.push(textNode(value));
      } else if (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
      ) {
        children.push(textNode(String(value)));
      } else {
        src.fail(
          'only text and expr(...) may appear as brace children',
          'INVALID_CHILD',
          braceStart,
        );
      }
    }
  }
}

function build(
  tag: string,
  props: Record<string, PropValue>,
  directives: Directives,
  children: MosaicNode[],
  hasProps: boolean,
  hasDirectives: boolean,
): MosaicNode {
  const node: MosaicNode = { type: tag };
  if (hasProps) node.props = props;
  if (hasDirectives) node.directives = directives;
  if (children.length > 0) node.children = children;
  return node;
}

function assignDirective(
  src: Source,
  directives: Directives,
  name: string,
  value: PropValue,
  pos: number,
): void {
  if (name === 'on:event') {
    if (value === null || typeof value !== 'object' || Array.isArray(value) || isExprRef(value)) {
      src.fail('on:event takes { event: action } object', 'INVALID_DIRECTIVE', pos);
    }
    const events: Record<string, ActionRef> = {};
    for (const [event, action] of Object.entries(value)) {
      if (typeof action === 'string') {
        events[event] = action;
      } else if (
        action !== null &&
        typeof action === 'object' &&
        !Array.isArray(action) &&
        typeof (action as { action?: unknown }).action === 'string'
      ) {
        events[event] = action as { action: string; args?: Record<string, PropValue> };
      } else {
        src.fail(`invalid action for on:event '${event}'`, 'INVALID_DIRECTIVE', pos);
      }
    }
    directives['on:event'] = events;
    return;
  }
  if (name === 'key') {
    if (typeof value === 'string' || isExprRef(value)) {
      directives.key = value;
      return;
    }
    src.fail('key takes a string or expr(...)', 'INVALID_DIRECTIVE', pos);
  }
  if (typeof value !== 'string') {
    src.fail(`${name} takes a string`, 'INVALID_DIRECTIVE', pos);
  }
  (directives as Record<string, string>)[name] = value;
}

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
  const collapsed = out.replace(/\s+/g, ' ');
  const trimmed = collapsed.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseAttrValue(src: Source): PropValue {
  if (src.at() === '"' || src.at() === "'") return readString(src);
  if (src.at() === '{') {
    const start = src.pos;
    src.pos++;
    src.skipWs();
    const value = parseBraceLiteral(src);
    src.skipWs();
    if (src.at() !== '}') src.fail('expected }', 'EXPECTED_BRACE', start);
    src.pos++;
    return value;
  }
  src.fail('expected "…" or {…}', 'EXPECTED_VALUE');
}

/** The brace grammar: JSON-compatible literals plus token("…") and expr("…").
 *  This is the compile-time safety guarantee (invariant 1). */
function parseBraceLiteral(src: Source): PropValue {
  src.skipWs();
  // strip comments inside literals (e.g. multiline arrays with notes)
  while (src.startsWith('/*')) {
    const end = src.text.indexOf('*/', src.pos);
    if (end === -1) src.fail('unterminated comment', 'UNTERMINATED_COMMENT');
    src.pos = end + 2;
    src.skipWs();
  }
  const c = src.at();
  if (c === '"' || c === "'") return readString(src);
  if (c === '{') return readObject(src);
  if (c === '[') return readArray(src);
  if (c === '-' || /[0-9]/.test(c)) return readNumber(src);
  if (/[A-Za-z_]/.test(c)) {
    const start = src.pos;
    const word = readIdent(src);
    if (word === 'true') return true;
    if (word === 'false') return false;
    if (word === 'null') return null;
    if (word === 'expr' || word === 'token') {
      src.skipWs();
      if (src.at() !== '(')
        src.fail(`${word} must be called: ${word}("…")`, 'INVALID_LITERAL', start);
      src.pos++;
      src.skipWs();
      if (src.at() !== '"' && src.at() !== "'") {
        src.fail(`${word}(...) takes one string literal`, 'INVALID_LITERAL', start);
      }
      const arg = readString(src);
      src.skipWs();
      if (src.at() !== ')') src.fail('expected )', 'INVALID_LITERAL', start);
      src.pos++;
      return word === 'expr' ? ({ $expr: arg } satisfies ExprRef) : { $token: arg };
    }
    if (src.at() === '=' && src.at(1) === '>') {
      src.fail('arrow functions are not Mosaic; use expr("…")', 'CODE_IN_BRACES', start);
    }
    src.fail(
      `identifier '${word}' is not Mosaic; braces admit literals, token("…"), and expr("…")`,
      'CODE_IN_BRACES',
      start,
    );
  }
  if (c === '`') src.fail('template literals are not Mosaic; use expr("…")', 'CODE_IN_BRACES');
  if (src.startsWith('...')) src.fail('spread of identifiers is not Mosaic', 'CODE_IN_BRACES');
  src.fail(`unexpected '${c}' in braces`, 'INVALID_LITERAL');
}

function readIdent(src: Source): string {
  let out = '';
  while (/[A-Za-z0-9_]/.test(src.at())) {
    out += src.at();
    src.pos++;
  }
  return out;
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
      else if (esc === '\\' || esc === '"' || esc === "'") out += esc;
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
  const m = /^-?[0-9]*\.?[0-9]+(?:[eE][+-]?[0-9]+)?/.exec(src.text.slice(src.pos));
  if (!m) src.fail('invalid number', 'INVALID_LITERAL');
  src.pos += m[0].length;
  return Number(m[0]);
}

function readArray(src: Source): PropValue[] {
  src.pos++; // '['
  const out: PropValue[] = [];
  for (;;) {
    skipLiteralWs(src);
    if (src.at() === ']') {
      src.pos++;
      return out;
    }
    out.push(parseBraceLiteral(src));
    skipLiteralWs(src);
    if (src.at() === ',') {
      src.pos++;
      continue;
    }
    if (src.at() === ']') {
      src.pos++;
      return out;
    }
    src.fail("expected ',' or ']'", 'INVALID_LITERAL');
  }
}

function readObject(src: Source): { [k: string]: PropValue } {
  src.pos++; // '{'
  const out: { [k: string]: PropValue } = {};
  for (;;) {
    skipLiteralWs(src);
    if (src.at() === '}') {
      src.pos++;
      return out;
    }
    let key: string;
    if (src.at() === '"' || src.at() === "'") {
      key = readString(src);
    } else if (/[A-Za-z_]/.test(src.at())) {
      key = readIdent(src);
    } else if (src.startsWith('...')) {
      src.fail('spread of identifiers is not Mosaic', 'CODE_IN_BRACES');
    } else {
      src.fail('expected a key', 'INVALID_LITERAL');
    }
    skipLiteralWs(src);
    if (src.at() !== ':') src.fail("expected ':'", 'INVALID_LITERAL');
    src.pos++;
    out[key] = parseBraceLiteral(src);
    skipLiteralWs(src);
    if (src.at() === ',') {
      src.pos++;
      continue;
    }
    if (src.at() === '}') {
      src.pos++;
      return out;
    }
    src.fail("expected ',' or '}'", 'INVALID_LITERAL');
  }
}

function skipLiteralWs(src: Source): void {
  src.skipWs();
  while (src.startsWith('/*')) {
    const end = src.text.indexOf('*/', src.pos);
    if (end === -1) src.fail('unterminated comment', 'UNTERMINATED_COMMENT');
    src.pos = end + 2;
    src.skipWs();
  }
}
