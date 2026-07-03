// The Mosaic IR types (docs/proposal.md §5): MosaicNode, MosaicDocument, and
// the grammar for prop values, expr refs, directives, and on:event actions.
// Everything the compiler writes and renderers read lives here; no logic.

/** The wire format version. Every document carries this so hosts can gate
 *  incompatible releases. */
export const MOSAIC_VERSION = '1.0' as const;

/** The MIME type for a serialized MosaicDocument. */
export const MOSAIC_MEDIA_TYPE = 'application/vnd.mosaic+json' as const;

/** The conventional file extension for fenced mosaic-jsx artifacts. */
export const MOSAIC_EXTENSION = '.mosaic' as const;

/** Any JSON-compatible value: used for schema-typed prop fields. */
export type JsonLiteral =
  | string
  | number
  | boolean
  | null
  | JsonLiteral[]
  | { [k: string]: JsonLiteral };

/** An unevaluated expression embedded in a prop value: `{ $expr: "..." }`.
 *  The runtime evaluates it against state before the host sees the prop. */
export type ExprRef = { $expr: string };

/** A prop value: a JSON literal that may embed expr(...) refs. */
export type PropValue =
  | string
  | number
  | boolean
  | null
  | PropValue[]
  | ExprRef
  | { [k: string]: PropValue };

/** True when v is an ExprRef (a single-key object whose key is $expr). */
export function isExprRef(v: unknown): v is ExprRef {
  return (
    typeof v === 'object' &&
    v !== null &&
    !Array.isArray(v) &&
    typeof (v as ExprRef).$expr === 'string' &&
    Object.keys(v).length === 1
  );
}

/** An on:event action: a local state mutation (state.set / state.toggle, applied
 *  by Mosaic) or a named host intent the host interprets. args may carry expr(...). */
export type ActionRef = string | { action: string; args?: Record<string, PropValue> };

/** The complete set of IR directives: binding, conditionals, loops, slots,
 *  events. Directives are universal across all block types. */
export type Directives = {
  'bind:state'?: string;
  'from:state'?: string;
  'from:expr'?: string; // derived value: a bounded expr(...) expression
  'if:show'?: string; // conditional render: a boolean expr(...)
  'for:each'?: string; // repeater, e.g. "filter(rows, r, r.n > 0) as row"
  'on:event'?: Record<string, ActionRef>;
  'slot:name'?: string;
  'from:ref'?: string;
  key?: string | ExprRef;
};

/** Every valid directive key; used by validate to reject unknown directive names. */
export const DIRECTIVE_NAMES = [
  'bind:state',
  'from:state',
  'from:expr',
  'if:show',
  'for:each',
  'on:event',
  'slot:name',
  'from:ref',
  'key',
] as const;

/** The union of all valid directive names. */
export type DirectiveName = (typeof DIRECTIVE_NAMES)[number];

/** The reserved type of a text node. Its value lives in props.value and may be
 *  a string or an ExprRef (an inline `{expression}` child). */
export const TEXT_TYPE = '#text' as const;

/** One IR node: a block element, a text node (type === TEXT_TYPE), or a slot
 *  child. The compiler produces these; renderers consume them via walk(). */
export type MosaicNode = {
  kind?: 'primitive' | 'component' | 'text';
  type: string;
  props?: Record<string, PropValue>;
  directives?: Directives;
  children?: MosaicNode[];
  slots?: Record<string, MosaicNode[]>;
  key?: string;
};

/** A complete artifact: a version tag, a unique id, a root node, and an optional
 *  ref map for named subtrees. Serializable to mosaic-json or mosaic-jsx. */
export type MosaicDocument = {
  mosaic_version: typeof MOSAIC_VERSION;
  id: string;
  root: MosaicNode;
  refs?: Record<string, MosaicNode>;
};

/** Construct a text node from a literal string or an ExprRef. */
export function textNode(value: string | ExprRef): MosaicNode {
  return { kind: 'text', type: TEXT_TYPE, props: { value } };
}

/** True when the node is a text node (type === TEXT_TYPE). */
export function isTextNode(node: MosaicNode): boolean {
  return node.type === TEXT_TYPE;
}
