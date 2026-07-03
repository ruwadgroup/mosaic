// Canonical serialization (docs/proposal.md §5.2, §5.3): fixed key order,
// alphabetical props, compact literals — what makes artifacts diffable.
//
// toJsxSource is the writer half of the compiler: it prints the IR back as
// natural JSX (if:show as {cond && <El/>}, for:each as {list.map(…)},
// bind:state as value={path}/checked={path}, on:event as onClick={…}), so
// parse(toJsxSource(doc)) round-trips to the same document.

import {
  type ActionRef,
  MOSAIC_VERSION,
  type MosaicDocument,
  type MosaicNode,
  type PropValue,
  TEXT_TYPE,
  isExprRef,
} from './ast.js';
import { exprAst } from './expr.js';
import { parseForEach } from './validate.js';

const NODE_KEY_ORDER = ['kind', 'type', 'props', 'directives', 'children', 'slots', 'key'] as const;
const DOC_KEY_ORDER = ['mosaic_version', 'id', 'root', 'refs'] as const;

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value !== null && typeof value === 'object') {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(src).sort()) {
      if (src[k] !== undefined) out[k] = canonicalValue(src[k]);
    }
    return out;
  }
  return value;
}

function canonicalNode(node: MosaicNode): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of NODE_KEY_ORDER) {
    const v = node[key];
    if (v === undefined) continue;
    if (key === 'children') {
      out.children = (v as MosaicNode[]).map(canonicalNode);
    } else if (key === 'slots') {
      const slots: Record<string, unknown> = {};
      for (const name of Object.keys(v as Record<string, MosaicNode[]>).sort()) {
        slots[name] = (v as Record<string, MosaicNode[]>)[name]?.map(canonicalNode);
      }
      out.slots = slots;
    } else if (key === 'props' || key === 'directives') {
      out[key] = canonicalValue(v);
    } else {
      out[key] = v;
    }
  }
  return out;
}

/** Serialize a document to canonical mosaic-json. */
export function toCanonicalJson(doc: MosaicDocument): string {
  const out: Record<string, unknown> = {};
  for (const key of DOC_KEY_ORDER) {
    const v = doc[key];
    if (v === undefined) continue;
    if (key === 'root') out.root = canonicalNode(doc.root);
    else if (key === 'refs') {
      const refs: Record<string, unknown> = {};
      for (const name of Object.keys(doc.refs ?? {}).sort()) {
        const ref = doc.refs?.[name];
        if (ref) refs[name] = canonicalNode(ref);
      }
      out.refs = refs;
    } else out[key] = v;
  }
  return JSON.stringify(out);
}

const IDENT_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
/** Blocks whose binding prop is `checked` rather than `value`. */
const CHECKED_BLOCKS = new Set(['Checkbox', 'Toggle', 'Radio']);

/** Print a PropValue as JS-literal source for a brace position. Expr refs are
 *  emitted as their canonical source (the reader accepts canonical fold form). */
function jsValue(value: PropValue): string {
  if (isExprRef(value)) return value.$expr;
  if (Array.isArray(value)) return `[${value.map(jsValue).join(', ')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${IDENT_RE.test(k) ? k : JSON.stringify(k)}: ${jsValue(v)}`);
    return entries.length > 0 ? `{ ${entries.join(', ')} }` : '{}';
  }
  return JSON.stringify(value);
}

function serializeAttr(name: string, value: PropValue): string {
  if (value === true) return name;
  if (typeof value === 'string') return `${name}=${JSON.stringify(value)}`;
  return `${name}={${jsValue(value)}}`;
}

function handlerSource(action: ActionRef): string {
  if (typeof action === 'string') {
    return IDENT_RE.test(action) ? action : JSON.stringify(action);
  }
  if (action.action === 'state.set' || action.action === 'state.toggle') {
    const path = String(action.args?.path ?? '');
    if (action.action === 'state.toggle') return `toggle(${path})`;
    const value = action.args?.value;
    return `set(${path}, ${isExprRef(value) ? value.$expr : jsValue(value ?? null)})`;
  }
  const args = action.args;
  const name = IDENT_RE.test(action.action) ? action.action : null;
  if (name === null) {
    if (args && Object.keys(args).length > 0) {
      throw new Error(
        `mosaic: intent '${action.action}' with args cannot be serialized to mosaic-jsx (the name is not an identifier)`,
      );
    }
    return JSON.stringify(action.action);
  }
  if (args && Object.keys(args).length > 0) return `${name}(${jsValue(args)})`;
  return name;
}

/** Whether an if:show condition needs parens before `&& <El/>`. */
function condNeedsParens(source: string): boolean {
  try {
    const ast = exprAst(source);
    return ast.t === 'cond' || (ast.t === 'binary' && ast.op === '||');
  } catch {
    return true;
  }
}

/** Whether a for:each list expression needs parens before `.map(...)`. */
function listNeedsParens(source: string): boolean {
  try {
    const ast = exprAst(source);
    return !['ident', 'member', 'index', 'call', 'list', 'lit'].includes(ast.t);
  } catch {
    return true;
  }
}

const UNSERIALIZABLE_DIRECTIVES = ['from:state', 'from:expr', 'slot:name', 'from:ref'] as const;

/** The element itself - tag, props, compiled directive attributes, children -
 *  without the if:show / for:each wrappers. */
function serializeElement(node: MosaicNode, indent: string): string {
  const directives = node.directives ?? {};
  for (const name of UNSERIALIZABLE_DIRECTIVES) {
    if (directives[name] !== undefined) {
      throw new Error(`mosaic: directive '${name}' has no mosaic-jsx serialization`);
    }
  }

  const parts: string[] = [];
  for (const [k, v] of Object.entries(node.props ?? {})) parts.push(serializeAttr(k, v));
  const bind = directives['bind:state'];
  if (typeof bind === 'string') {
    parts.push(`${CHECKED_BLOCKS.has(node.type) ? 'checked' : 'value'}={${bind}}`);
  }
  if (directives.key !== undefined) parts.push(serializeAttr('key', directives.key));
  for (const [event, action] of Object.entries(directives['on:event'] ?? {})) {
    const name = `on${event.charAt(0).toUpperCase()}${event.slice(1)}`;
    parts.push(`${name}={${handlerSource(action)}}`);
  }

  const attrs = parts.length > 0 ? ` ${parts.join(' ')}` : '';
  const children = node.children ?? [];
  if (children.length === 0) return `${indent}<${node.type}${attrs} />`;
  const inner = children.map((c) => serializeNode(c, `${indent}  `)).join('\n');
  return `${indent}<${node.type}${attrs}>\n${inner}\n${indent}</${node.type}>`;
}

function serializeNode(node: MosaicNode, indent: string): string {
  if (node.type === TEXT_TYPE) {
    const value = node.props?.value;
    if (isExprRef(value)) return `${indent}{${value.$expr}}`;
    return `${indent}${String(value ?? '')}`;
  }

  const directives = node.directives ?? {};
  const forEach = directives['for:each'];
  const ifShow = directives['if:show'];
  if (typeof forEach !== 'string' && typeof ifShow !== 'string') {
    return serializeElement(node, indent);
  }

  const condSrc =
    typeof ifShow === 'string' ? (condNeedsParens(ifShow) ? `(${ifShow})` : ifShow) : undefined;

  if (typeof forEach === 'string') {
    const parsed = parseForEach(forEach);
    if (!parsed) {
      throw new Error(`mosaic: for:each '${forEach}' is not "EXPR as item[, i]"`);
    }
    const list = listNeedsParens(parsed.expr) ? `(${parsed.expr})` : parsed.expr;
    const params =
      parsed.index !== undefined ? `(${parsed.binding}, ${parsed.index})` : `(${parsed.binding})`;
    const prefix = condSrc !== undefined ? `${condSrc} && ` : '';
    const element = serializeElement(node, `${indent}  `);
    if (!element.includes('\n')) {
      return `${indent}{${list}.map(${params} => ${prefix}${element.trim()})}`;
    }
    return `${indent}{${list}.map(${params} => ${prefix}(\n${element}\n${indent}))}`;
  }

  const element = serializeElement(node, `${indent}  `);
  if (!element.includes('\n')) {
    return `${indent}{${condSrc} && ${element.trim()}}`;
  }
  return `${indent}{${condSrc} && (\n${element}\n${indent})}`;
}

/** Serialize a document to canonical mosaic-jsx source. */
export function toJsxSource(doc: MosaicDocument): string {
  return serializeNode(doc.root, '');
}

const FENCE_RE = /^```mosaic\s+v=(\S+)\s+id=(\S+)\s*$/;

/** Extract version and id from a ```mosaic v=1 id=… fence line. */
export function parseFence(line: string): { version: string; id: string } | null {
  const m = FENCE_RE.exec(line.trim());
  if (!m) return null;
  return { version: m[1] as string, id: m[2] as string };
}

/** Split a .mosaic file into its fence header (if any) and body. */
export function stripFence(text: string): { id?: string; version?: string; body: string } {
  const trimmed = text.trim();
  if (!trimmed.startsWith('```')) return { body: trimmed };
  const newline = trimmed.indexOf('\n');
  if (newline === -1) return { body: '' };
  const header = parseFence(trimmed.slice(0, newline));
  let body = trimmed.slice(newline + 1);
  const closing = body.lastIndexOf('```');
  if (closing !== -1) body = body.slice(0, closing);
  return { id: header?.id, version: header?.version, body: body.trim() };
}

/** Serialize a document to a fenced .mosaic file (canonical mosaic-jsx). */
export function toMosaicFile(doc: MosaicDocument): string {
  return `\`\`\`mosaic v=${MOSAIC_VERSION.split('.')[0]} id=${doc.id}\n${toJsxSource(doc)}\n\`\`\`\n`;
}
