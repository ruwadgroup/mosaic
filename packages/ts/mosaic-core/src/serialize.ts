// Canonical serialization (docs/proposal.md §5.2, §5.3): fixed key order,
// alphabetical props, compact literals — what makes artifacts diffable.

import {
  MOSAIC_VERSION,
  type MosaicDocument,
  type MosaicNode,
  type PropValue,
  TEXT_TYPE,
  isExprRef,
  isTokenRef,
} from './ast.js';

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

function serializeValue(value: PropValue): string {
  if (isExprRef(value)) return `expr(${JSON.stringify(value.$expr)})`;
  if (isTokenRef(value)) return `token(${JSON.stringify(value.$token)})`;
  if (Array.isArray(value)) return `[${value.map(serializeValue).join(', ')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .map(
        ([k, v]) =>
          `${/^[A-Za-z_][A-Za-z0-9_]*$/.test(k) ? k : JSON.stringify(k)}: ${serializeValue(v)}`,
      );
    return `{ ${entries.join(', ')} }`;
  }
  return JSON.stringify(value);
}

function serializeAttr(name: string, value: PropValue): string {
  if (value === true) return name;
  if (typeof value === 'string') return `${name}=${JSON.stringify(value)}`;
  return `${name}={${serializeValue(value)}}`;
}

function serializeNode(node: MosaicNode, indent: string): string {
  if (node.type === TEXT_TYPE) {
    const value = node.props?.value;
    if (isExprRef(value)) return `${indent}{${serializeValue(value)}}`;
    return `${indent}${String(value ?? '')}`;
  }
  const parts: string[] = [];
  for (const [k, v] of Object.entries(node.props ?? {})) parts.push(serializeAttr(k, v));
  for (const [k, v] of Object.entries(node.directives ?? {})) {
    parts.push(serializeAttr(k, v as PropValue));
  }
  const attrs = parts.length > 0 ? ` ${parts.join(' ')}` : '';
  const children = node.children ?? [];
  if (children.length === 0) return `${indent}<${node.type}${attrs} />`;
  const inner = children.map((c) => serializeNode(c, `${indent}  `)).join('\n');
  return `${indent}<${node.type}${attrs}>\n${inner}\n${indent}</${node.type}>`;
}

/** Serialize a document to canonical mosaic-jsx source. */
export function toJsxSource(doc: MosaicDocument): string {
  return serializeNode(doc.root, '');
}

// --- the ```mosaic fence -----------------------------------------------------

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
