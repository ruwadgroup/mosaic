// resolve + walk: expr evaluation against state, directive expansion, and the
// portable NodeVisitor contract (docs/proposal.md §3.2, §7.2).

import {
  type JsonLiteral,
  type MosaicDocument,
  type MosaicNode,
  type PropValue,
  TEXT_TYPE,
  isExprRef,
  isTokenRef,
  textNode,
} from './ast.js';
import { type ExprValue, displayValue, evalExpr } from './expr.js';
import type { HostManifest } from './manifest.js';
import { blockSpec } from './registry.js';
import { parseForEach } from './validate.js';

export type StateScope = Record<string, ExprValue>;

/** The initial state an artifact declares: the root's `state={{…}}` prop. */
export function initialState(doc: MosaicDocument): StateScope {
  const state = doc.root.props?.state;
  if (state !== null && typeof state === 'object' && !Array.isArray(state) && !isExprRef(state)) {
    return { ...(state as StateScope) };
  }
  return {};
}

function resolveValue(value: PropValue, scope: StateScope): PropValue {
  if (isExprRef(value)) return (evalExpr(value.$expr, scope) ?? null) as PropValue;
  if (isTokenRef(value)) return value; // tokens are the renderer's to map
  if (Array.isArray(value)) return value.map((v) => resolveValue(v, scope));
  if (value !== null && typeof value === 'object') {
    const out: Record<string, PropValue> = {};
    for (const [k, v] of Object.entries(value)) out[k] = resolveValue(v, scope);
    return out;
  }
  return value;
}

function resolveNode(node: MosaicNode, scope: StateScope, interactive: boolean): MosaicNode | null {
  const directives = node.directives ?? {};

  if (interactive && typeof directives['if:show'] === 'string') {
    const show = evalExpr(directives['if:show'], scope);
    if (!show) return null;
  }

  if (node.type === TEXT_TYPE) {
    const value = node.props?.value;
    if (isExprRef(value)) return textNode(displayValue(evalExpr(value.$expr, scope)));
    return node;
  }

  const props: Record<string, PropValue> = {};
  for (const [k, v] of Object.entries(node.props ?? {})) props[k] = resolveValue(v, scope);

  if (typeof directives['from:state'] === 'string') {
    props.value = (scope[directives['from:state']] ?? null) as PropValue;
  }
  if (interactive && typeof directives['from:expr'] === 'string') {
    props.value = (evalExpr(directives['from:expr'], scope) ?? null) as PropValue;
  }
  if (typeof directives['bind:state'] === 'string') {
    const bound = scope[directives['bind:state']];
    if (bound !== undefined) props.value = bound as PropValue;
  }

  const out: MosaicNode = { ...node, props };

  let resolvedDirectives = directives;
  if (isExprRef(directives.key)) {
    resolvedDirectives = {
      ...resolvedDirectives,
      key: displayValue(evalExpr(directives.key.$expr, scope)),
    };
  }
  // Intent args resolve here, so the host receives the *computed* values
  // (the total), never raw expr refs.
  const events = directives['on:event'];
  if (interactive && events) {
    const resolvedEvents: NonNullable<MosaicNode['directives']>['on:event'] = {};
    for (const [event, action] of Object.entries(events)) {
      if (typeof action === 'object' && action !== null && action.args) {
        const args: Record<string, PropValue> = {};
        for (const [k, v] of Object.entries(action.args)) args[k] = resolveValue(v, scope);
        resolvedEvents[event] = { ...action, args };
      } else {
        resolvedEvents[event] = action;
      }
    }
    resolvedDirectives = { ...resolvedDirectives, 'on:event': resolvedEvents };
  }
  if (resolvedDirectives !== directives) out.directives = resolvedDirectives;

  const children: MosaicNode[] = [];
  for (const child of node.children ?? []) {
    const forEach = child.directives?.['for:each'];
    if (interactive && typeof forEach === 'string') {
      const parsed = parseForEach(forEach);
      if (parsed) {
        const items = evalExpr(parsed.expr, scope);
        if (Array.isArray(items)) {
          for (const item of items) {
            const itemScope = { ...scope, [parsed.binding]: item };
            const { 'for:each': _dropped, ...rest } = child.directives ?? {};
            const instance = resolveNode({ ...child, directives: rest }, itemScope, interactive);
            if (instance) children.push(instance);
          }
        }
        continue;
      }
    }
    const resolved = resolveNode(child, scope, interactive);
    if (resolved) children.push(resolved);
  }
  if (node.children) out.children = children;

  // A node that repeats itself at the root of a subtree (for:each on the node
  // walk() is called with) is handled by its parent; the root case falls through.
  return out;
}

/** Resolve a document against a state scope: evaluate derived expressions,
 *  apply if:show, expand for:each, and fill control values. Tokens stay as
 *  refs — mapping them to a design is the renderer's job. */
export function resolve(
  doc: MosaicDocument,
  manifest: HostManifest,
  state?: StateScope,
): MosaicDocument {
  const scope = state ?? initialState(doc);
  const root = resolveNode(doc.root, scope, manifest.interactive) ?? {
    type: 'Box',
  };
  return { ...doc, root };
}

// --- walk: the portable renderer contract ------------------------------------

export type NodeVisitor<T> = {
  primitive(type: string, props: Record<string, PropValue>, children: T[], node: MosaicNode): T;
  text(value: string): T;
};

function walkNode<T>(node: MosaicNode, visitor: NodeVisitor<T>, manifest: HostManifest): T {
  if (node.type === TEXT_TYPE) {
    const value = node.props?.value;
    return visitor.text(
      typeof value === 'string' ? value : displayValue((value ?? '') as JsonLiteral),
    );
  }
  const spec = blockSpec(node.type);
  if (spec?.rich && spec.decomposeTo && !manifest.components_supported.includes(node.type)) {
    return walkNode(spec.decomposeTo(node), visitor, manifest);
  }
  const children = (node.children ?? []).map((c) => walkNode(c, visitor, manifest));
  return visitor.primitive(node.type, node.props ?? {}, children, node);
}

/** Map each resolved node to one host-native surface. Rich components are
 *  expanded via decomposeTo before the visitor sees them. */
export function walk<T>(doc: MosaicDocument, visitor: NodeVisitor<T>, manifest: HostManifest): T {
  return walkNode(doc.root, visitor, manifest);
}
