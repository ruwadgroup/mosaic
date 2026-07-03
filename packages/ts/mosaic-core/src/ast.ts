export const MOSAIC_VERSION = '1.0' as const;
export const MOSAIC_MEDIA_TYPE = 'application/vnd.mosaic+json' as const;
export const MOSAIC_EXTENSION = '.mosaic' as const;

export type JsonLiteral =
  | string
  | number
  | boolean
  | null
  | JsonLiteral[]
  | { [k: string]: JsonLiteral };

export type ExprRef = { $expr: string };
export type TokenRef = { $token: string };

/** A prop value: a JSON literal that may embed expr(...) / token(...) refs. */
export type PropValue =
  | string
  | number
  | boolean
  | null
  | PropValue[]
  | ExprRef
  | TokenRef
  | { [k: string]: PropValue };

export function isExprRef(v: unknown): v is ExprRef {
  return (
    typeof v === 'object' &&
    v !== null &&
    !Array.isArray(v) &&
    typeof (v as ExprRef).$expr === 'string' &&
    Object.keys(v).length === 1
  );
}

export function isTokenRef(v: unknown): v is TokenRef {
  return (
    typeof v === 'object' &&
    v !== null &&
    !Array.isArray(v) &&
    typeof (v as TokenRef).$token === 'string' &&
    Object.keys(v).length === 1
  );
}

/** An on:event action: a local state mutation (state.set / state.toggle, applied
 *  by Mosaic) or a named host intent the host interprets. args may carry expr(...). */
export type ActionRef = string | { action: string; args?: Record<string, PropValue> };

export type Directives = {
  'bind:state'?: string;
  'from:state'?: string;
  'from:expr'?: string; // derived value: a bounded expr(...) expression
  'if:show'?: string; // conditional render: a boolean expr(...)
  'for:each'?: string; // repeater, e.g. "filter(rows, r, r.n > 0) as row"
  'on:event'?: Record<string, ActionRef>;
  'theme:scope'?: string;
  'slot:name'?: string;
  'from:ref'?: string;
  key?: string | ExprRef;
};

export const DIRECTIVE_NAMES = [
  'bind:state',
  'from:state',
  'from:expr',
  'if:show',
  'for:each',
  'on:event',
  'theme:scope',
  'slot:name',
  'from:ref',
  'key',
] as const;

export type DirectiveName = (typeof DIRECTIVE_NAMES)[number];

/** The reserved type of a text node. Its value lives in props.value and may be
 *  a string or an ExprRef (an inline `{expr("…")}` child). */
export const TEXT_TYPE = '#text' as const;

export type MosaicNode = {
  kind?: 'primitive' | 'component' | 'text';
  type: string;
  props?: Record<string, PropValue>;
  directives?: Directives;
  children?: MosaicNode[];
  slots?: Record<string, MosaicNode[]>;
  key?: string;
};

export type MosaicDocument = {
  mosaic_version: typeof MOSAIC_VERSION;
  id: string;
  root: MosaicNode;
  refs?: Record<string, MosaicNode>;
};

export function textNode(value: string | ExprRef): MosaicNode {
  return { kind: 'text', type: TEXT_TYPE, props: { value } };
}

export function isTextNode(node: MosaicNode): boolean {
  return node.type === TEXT_TYPE;
}
