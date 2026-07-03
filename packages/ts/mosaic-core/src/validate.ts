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

export type ValidationDiagnostic = {
  path: string;
  type: string;
  code:
    | 'UNKNOWN_TAG'
    | 'MISSING_REQUIRED_PROP'
    | 'INVALID_PROP_VALUE'
    | 'INVALID_DIRECTIVE'
    | 'INVALID_EXPR'
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

/** The for:each grammar: "EXPR as name". */
export function parseForEach(source: string): { expr: string; binding: string } | null {
  const m = /^([\s\S]+)\s+as\s+([A-Za-z_][A-Za-z0-9_]*)\s*$/.exec(source);
  if (!m) return null;
  return { expr: (m[1] as string).trim(), binding: m[2] as string };
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
    if (name === 'if:show' || name === 'from:expr') {
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
            fix: 'for:each takes "EXPR as name"',
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
