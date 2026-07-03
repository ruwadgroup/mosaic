// validate: the registry × manifest check (docs/proposal.md §3.2).

import {
  DIRECTIVE_NAMES,
  type MosaicDocument,
  type MosaicNode,
  type PropValue,
  TEXT_TYPE,
  isExprRef,
} from './ast.js';
import { parseExpr } from './expr.js';
import type { HostManifest } from './manifest.js';
import { blockSpec } from './registry.js';
import { parseStatePath } from './state-path.js';

export type ValidationDiagnostic = {
  path: string;
  type: string;
  code:
    | 'UNKNOWN_TAG'
    | 'MISSING_REQUIRED_PROP'
    | 'INVALID_PROP_VALUE'
    | 'INVALID_DIRECTIVE'
    | 'INVALID_EXPR'
    | 'INVALID_STATE_PATH'
    | 'INVALID_DIAGRAM'
    | 'UNSUPPORTED_BY_HOST';
  fix?: string;
  prop?: string;
};

export type ValidationResult =
  | { ok: true; doc: MosaicDocument; warnings: ValidationDiagnostic[] }
  | { ok: false; errors: ValidationDiagnostic[] };

const DIRECTIVE_SET = new Set<string>(DIRECTIVE_NAMES);

function checkExprSource(
  source: string,
  path: string,
  type: string,
  prop: string,
  errors: ValidationDiagnostic[],
): void {
  try {
    parseExpr(source);
  } catch (e) {
    errors.push({
      path,
      type,
      code: 'INVALID_EXPR',
      prop,
      fix: e instanceof Error ? e.message : String(e),
    });
  }
}

function checkPropExprs(
  value: PropValue,
  path: string,
  type: string,
  prop: string,
  errors: ValidationDiagnostic[],
): void {
  if (isExprRef(value)) {
    checkExprSource(value.$expr, path, type, prop, errors);
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) checkPropExprs(v, path, type, prop, errors);
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const v of Object.values(value)) checkPropExprs(v, path, type, prop, errors);
  }
}

function checkStatePathSource(
  source: string,
  path: string,
  type: string,
  prop: string,
  errors: ValidationDiagnostic[],
): void {
  try {
    parseStatePath(source);
  } catch (e) {
    errors.push({
      path,
      type,
      code: 'INVALID_STATE_PATH',
      prop,
      fix: e instanceof Error ? e.message : String(e),
    });
  }
}

/** Diagram structural checks (arch: ids unique across nodes and groups, edge
 *  endpoints and node group refs must resolve). Expr-valued structure resolves
 *  later, so literal shapes are all we can check here. */
function checkDiagram(node: MosaicNode, path: string, errors: ValidationDiagnostic[]): void {
  const push = (prop: string, fix: string) =>
    errors.push({ path, type: node.type, code: 'INVALID_DIAGRAM', prop, fix });
  const listOf = (prop: string): PropValue[] | null => {
    const raw = node.props?.[prop];
    if (raw === undefined || isExprRef(raw)) return raw === undefined ? [] : null;
    if (!Array.isArray(raw)) {
      push(prop, `${prop} must be an array`);
      return null;
    }
    return raw;
  };
  const asRecord = (item: PropValue): Record<string, PropValue> | null =>
    item !== null && typeof item === 'object' && !Array.isArray(item) && !isExprRef(item)
      ? (item as Record<string, PropValue>)
      : null;

  const nodes = listOf('nodes');
  const edges = listOf('edges');
  const groups = listOf('groups');
  if (nodes === null || edges === null || groups === null) return;

  const ids = new Set<string>();
  const groupIds = new Set<string>();
  const collect = (items: PropValue[], prop: string, into?: Set<string>) => {
    items.forEach((item, i) => {
      const rec = asRecord(item);
      if (!rec || typeof rec.id !== 'string' || typeof rec.label !== 'string') {
        push(prop, `${prop}[${i}] must be a record with a string id and label`);
        return;
      }
      if (ids.has(rec.id)) push(prop, `duplicate id "${rec.id}" across nodes and groups`);
      ids.add(rec.id);
      into?.add(rec.id);
    });
  };
  collect(nodes, 'nodes');
  collect(groups, 'groups', groupIds);

  nodes.forEach((item, i) => {
    const group = asRecord(item)?.group;
    if (group === undefined || isExprRef(group)) return;
    if (typeof group !== 'string' || !groupIds.has(group)) {
      push('nodes', `nodes[${i}].group "${String(group)}" does not match any groups[].id`);
    }
  });
  edges.forEach((item, i) => {
    const rec = asRecord(item);
    if (!rec) {
      push('edges', `edges[${i}] must be a record with from and to ids`);
      return;
    }
    for (const end of ['from', 'to'] as const) {
      const id = rec[end];
      if (isExprRef(id)) continue;
      if (typeof id !== 'string' || !ids.has(id)) {
        push('edges', `edges[${i}].${end} "${String(id)}" is neither a node nor a group id`);
      }
    }
  });
}

/** The for:each grammar: "EXPR as item", with an optional zero-based index
 *  binding "EXPR as item, i". */
export function parseForEach(
  source: string,
): { expr: string; binding: string; index?: string } | null {
  const m =
    /^([\s\S]+)\s+as\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:,\s*([A-Za-z_][A-Za-z0-9_]*))?\s*$/.exec(
      source,
    );
  if (!m) return null;
  return { expr: (m[1] as string).trim(), binding: m[2] as string, index: m[3] };
}

function visit(
  node: MosaicNode,
  path: string,
  manifest: HostManifest,
  errors: ValidationDiagnostic[],
  warnings: ValidationDiagnostic[],
): void {
  if (node.type === TEXT_TYPE) {
    const value = node.props?.value;
    if (isExprRef(value)) checkExprSource(value.$expr, path, node.type, 'value', errors);
    return;
  }

  const spec = blockSpec(node.type);
  if (!spec) {
    const diag: ValidationDiagnostic = {
      path,
      type: node.type,
      code: 'UNKNOWN_TAG',
      fix: 'not in the block registry; a host macro must expand before validation',
    };
    if (manifest.strict) errors.push(diag);
    else warnings.push(diag);
  } else {
    for (const required of spec.requiredProps ?? []) {
      if (node.props?.[required] === undefined) {
        errors.push({
          path,
          type: node.type,
          code: 'MISSING_REQUIRED_PROP',
          prop: required,
          fix: required === 'alt' ? 'every visual block carries alt (invariant 7)' : undefined,
        });
      }
    }
    if (spec.rich && !manifest.components_supported.includes(node.type)) {
      warnings.push({
        path,
        type: node.type,
        code: 'UNSUPPORTED_BY_HOST',
        fix: 'renders through its decomposeTo expansion',
      });
    }
    if (node.type === 'Diagram') checkDiagram(node, path, errors);
  }

  for (const [name, value] of Object.entries(node.props ?? {})) {
    checkPropExprs(value, path, node.type, name, errors);
  }

  const directives = node.directives ?? {};
  for (const [name, value] of Object.entries(directives)) {
    if (!DIRECTIVE_SET.has(name)) {
      errors.push({ path, type: node.type, code: 'INVALID_DIRECTIVE', prop: name });
      continue;
    }
    if (name === 'bind:state' || name === 'from:state') {
      if (typeof value === 'string') checkStatePathSource(value, path, node.type, name, errors);
    } else if (name === 'if:show' || name === 'from:expr') {
      if (typeof value === 'string') checkExprSource(value, path, node.type, name, errors);
    } else if (name === 'for:each') {
      if (typeof value === 'string') {
        const parsed = parseForEach(value);
        if (!parsed) {
          errors.push({
            path,
            type: node.type,
            code: 'INVALID_DIRECTIVE',
            prop: name,
            fix: 'for:each takes "EXPR as item" or "EXPR as item, i"',
          });
        } else {
          checkExprSource(parsed.expr, path, node.type, name, errors);
        }
      }
    } else if (name === 'key' && isExprRef(value)) {
      checkExprSource(value.$expr, path, node.type, name, errors);
    } else if (name === 'on:event' && value !== null && typeof value === 'object') {
      for (const action of Object.values(value as Record<string, PropValue>)) {
        if (action !== null && typeof action === 'object' && !Array.isArray(action)) {
          const args = (action as { args?: Record<string, PropValue> }).args ?? {};
          for (const [argName, argValue] of Object.entries(args)) {
            checkPropExprs(argValue, path, node.type, `on:event.${argName}`, errors);
          }
        }
      }
    }
  }

  node.children?.forEach((child, i) => {
    visit(child, `${path}.${i}`, manifest, errors, warnings);
  });
  for (const [slot, nodes] of Object.entries(node.slots ?? {})) {
    nodes.forEach((child, i) => {
      visit(child, `${path}.slots.${slot}.${i}`, manifest, errors, warnings);
    });
  }
}

/** Validate a document against the block registry and the host manifest. */
export function validate(doc: MosaicDocument, manifest: HostManifest): ValidationResult {
  const errors: ValidationDiagnostic[] = [];
  const warnings: ValidationDiagnostic[] = [];
  visit(doc.root, 'root', manifest, errors, warnings);
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, doc, warnings };
}
