// validate: the registry × manifest check (docs/proposal.md §3.2). The
// algorithm takes the registry explicitly (validateDocument); the public
// default-registry wrapper lives in index.ts so this module stays cycle-free.

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
import type { MosaicRegistry } from './registry.js';
import type { BlockDefinition, PropSpec } from './schema.js';
import { parseStatePath } from './state-path.js';

/** One validation finding: the IR path, the node type, a machine-readable code,
 *  an optional fix hint for the model, and an optional prop name. */
export type ValidationDiagnostic = {
  path: string;
  type: string;
  code:
    | 'UNKNOWN_TAG'
    | 'MISSING_REQUIRED_PROP'
    | 'INVALID_PROP_VALUE'
    | 'REMOVED_PROP'
    | 'INVALID_DIRECTIVE'
    | 'INVALID_EXPR'
    | 'INVALID_STATE_PATH'
    | 'INVALID_DIAGRAM'
    | 'UNSUPPORTED_BY_HOST';
  fix?: string;
  prop?: string;
};

/** The result of a validation run: either success with advisory warnings,
 *  or failure with a non-empty errors list. */
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

/** Shape-check one prop value against its schema. `expr(...)` resolves to a
 *  value at render, so an ExprRef is accepted wherever a scalar is expected and
 *  never rejected here. Unknown props (not in the schema) are left alone - a
 *  host may read extras. */
function checkValueShape(
  value: PropValue,
  spec: PropSpec,
  path: string,
  type: string,
  prop: string,
  errors: ValidationDiagnostic[],
): void {
  if (isExprRef(value)) return;
  const fail = (fix: string) => errors.push({ path, type, code: 'INVALID_PROP_VALUE', prop, fix });
  const isObj = (v: PropValue): v is Record<string, PropValue> =>
    v !== null && typeof v === 'object' && !Array.isArray(v) && !isExprRef(v);

  switch (spec.type) {
    case 'string':
      if (typeof value !== 'string' && typeof value !== 'number') fail('expected a string');
      break;
    case 'number':
      if (typeof value !== 'number') fail('expected a number');
      break;
    case 'boolean':
      if (typeof value !== 'boolean') fail('expected true or false');
      break;
    case 'enum':
      if (typeof value !== 'string' || !(spec.values ?? []).includes(value)) {
        fail(`expected one of: ${(spec.values ?? []).join(', ')}`);
      }
      break;
    case 'string[]':
    case 'number[]':
      if (!Array.isArray(value)) fail(`expected an array (${spec.type})`);
      break;
    case 'string[][]':
      if (!Array.isArray(value)) {
        fail('expected an array of rows');
      } else {
        value.forEach((row, i) => {
          if (!Array.isArray(row) && !isExprRef(row)) {
            fail(
              `[${i}] must be an array of cells (a string[]), not ${isObj(row) ? 'an object' : typeof row}`,
            );
          }
        });
      }
      break;
    case 'record[]':
      if (!Array.isArray(value)) {
        fail('expected an array of objects');
      } else if (spec.shape) {
        value.forEach((el, i) => {
          if (isExprRef(el)) return;
          if (!isObj(el)) {
            fail(`[${i}] must be an object`);
            return;
          }
          const obj = el as Record<string, PropValue>;
          for (const [k, ks] of Object.entries(spec.shape ?? {})) {
            if (ks.required && (obj[k] === undefined || obj[k] === null)) {
              fail(`[${i}] missing required "${k}"`);
            }
          }
        });
      }
      break;
    case 'record':
      if (!isObj(value)) fail('expected an object');
      break;
    default:
      break;
  }
}

/** Presentation props outside the semantic line (docs/proposal.md §A): the
 *  format carries meaning and structure; the host owns spacing, typography,
 *  and chrome. Keyed "Type.prop", with "*" matching any block; the fix names
 *  the replacement so a model working from a stale schema self-corrects. */
const REMOVED_PROPS: Readonly<Record<string, string>> = {
  '*.gap': 'gap was removed in 0.7 - the host owns spacing; drop it',
  '*.pad': 'pad was removed in 0.7 - the host owns spacing; drop it',
  'Text.size':
    'size was removed in 0.7 - use variant="label" (section micro-label) or variant="caption" (secondary text)',
  'Text.weight': 'weight was removed in 0.7 - use Markdown for inline emphasis',
  'Text.caps': 'caps was removed in 0.7 - use variant="label"',
  'Icon.size': 'size was removed in 0.7 - the host sizes icons contextually',
  'Button.size': 'size was removed in 0.7 - the host sizes controls',
  'Stack.wrap': 'wrap was removed in 0.7 - the host owns overflow',
  'Tabs.variant': 'variant was removed in 0.7 - the host owns tab chrome',
};

/** Check a node's literal props against its block definition: types, enum
 *  values, array element shapes, required props, and removed-in-0.7 props. */
function checkPropShapes(
  node: MosaicNode,
  def: BlockDefinition,
  path: string,
  errors: ValidationDiagnostic[],
): void {
  for (const [name, value] of Object.entries(node.props ?? {})) {
    const spec = def.props[name];
    if (spec !== undefined && value !== undefined) {
      checkValueShape(value, spec, path, node.type, name, errors);
    }
    if (spec === undefined) {
      const removed = REMOVED_PROPS[`${node.type}.${name}`] ?? REMOVED_PROPS[`*.${name}`];
      if (removed) {
        errors.push({ path, type: node.type, code: 'REMOVED_PROP', prop: name, fix: removed });
      }
    }
  }
  for (const [name, spec] of Object.entries(def.props)) {
    if (spec.required && node.props?.[name] === undefined) {
      errors.push({
        path,
        type: node.type,
        code: 'MISSING_REQUIRED_PROP',
        prop: name,
        fix: name === 'alt' ? 'every visual block carries alt (invariant 7)' : undefined,
      });
    }
  }
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
  registry: MosaicRegistry,
  errors: ValidationDiagnostic[],
  warnings: ValidationDiagnostic[],
): void {
  if (node.type === TEXT_TYPE) {
    const value = node.props?.value;
    if (isExprRef(value)) checkExprSource(value.$expr, path, node.type, 'value', errors);
    return;
  }

  const def = registry.get(node.type);
  if (!def) {
    const diag: ValidationDiagnostic = {
      path,
      type: node.type,
      code: 'UNKNOWN_TAG',
      fix: 'not in the block registry; use a registered block or recompose from primitives',
    };
    if (manifest.strict) errors.push(diag);
    else warnings.push(diag);
  } else {
    if (def.rich && !manifest.components_supported.includes(node.type)) {
      warnings.push({
        path,
        type: node.type,
        code: 'UNSUPPORTED_BY_HOST',
        fix: 'renders through its decompose expansion',
      });
    }
    if (node.type === 'Diagram') checkDiagram(node, path, errors);
    checkPropShapes(node, def, path, errors);
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
          const named = action as { action?: string; args?: Record<string, PropValue> };
          const args = named.args ?? {};
          if (named.action === 'state.set' || named.action === 'state.toggle') {
            const target = args.path;
            if (typeof target === 'string') {
              checkStatePathSource(target, path, node.type, name, errors);
            } else {
              errors.push({
                path,
                type: node.type,
                code: 'INVALID_DIRECTIVE',
                prop: name,
                fix: `${named.action} needs a string args.path`,
              });
            }
          }
          for (const [argName, argValue] of Object.entries(args)) {
            checkPropExprs(argValue, path, node.type, `on:event.${argName}`, errors);
          }
        }
      }
    }
  }

  node.children?.forEach((child, i) => {
    visit(child, `${path}.${i}`, manifest, registry, errors, warnings);
  });
  for (const [slot, nodes] of Object.entries(node.slots ?? {})) {
    nodes.forEach((child, i) => {
      visit(child, `${path}.slots.${slot}.${i}`, manifest, registry, errors, warnings);
    });
  }
}

/** Validate a document against a block registry and a host manifest. The
 *  public wrapper in index.ts defaults the registry to DEFAULT_REGISTRY. */
export function validateDocument(
  doc: MosaicDocument,
  manifest: HostManifest,
  registry: MosaicRegistry,
): ValidationResult {
  const errors: ValidationDiagnostic[] = [];
  const warnings: ValidationDiagnostic[] = [];
  visit(doc.root, 'root', manifest, registry, errors, warnings);
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, doc, warnings };
}
