// state-path: record-shaped state paths (docs/proposal.md §6.1).
//
// A state path is an expr AST consisting only of ident/member/index nodes
// rooted at an identifier: `eggs`, `data.view`, `files[i].checked`. Reads
// share expr member/index semantics (a missing segment yields null); writes
// are copy-on-write and never invent structure - the authored state={{...}}
// is the schema.

import { type ExprAst, ExprError, type ExprValue, evalExprAst, exprAst } from './expr.js';
import type { StateScope } from './resolve.js';

/** One step after the root in a state path: a named field or a computed index. */
export type StatePathSegment = { t: 'member'; prop: string } | { t: 'index'; idx: ExprAst };

/** A parsed state path: a root identifier plus zero or more member/index
 *  segments. Index segments carry their sub-AST so resolveStatePath can
 *  evaluate them against the current scope. */
export type StatePath = {
  /** The root identifier the path descends from. */
  root: string;
  segments: StatePathSegment[];
};

const pathCache = new Map<string, StatePath>();

/** Parse a state path with the expr parser, then shape-check it: ident/member/
 *  index chains only - no calls, no leading literals, no arithmetic outside
 *  [...]. Throws ExprError (validate reports it as INVALID_STATE_PATH). */
export function parseStatePath(source: string): StatePath {
  const cached = pathCache.get(source);
  if (cached) return cached;
  const segments: StatePathSegment[] = [];
  let node = exprAst(source);
  while (node.t === 'member' || node.t === 'index') {
    if (node.t === 'member') segments.unshift({ t: 'member', prop: node.prop });
    else segments.unshift({ t: 'index', idx: node.idx });
    node = node.obj;
  }
  if (node.t !== 'ident') {
    throw new ExprError(
      `invalid state path '${source}': a path is an identifier followed by .prop / [index] segments`,
    );
  }
  const path: StatePath = { root: node.name, segments };
  if (pathCache.size > 1000) pathCache.clear();
  pathCache.set(source, path);
  return path;
}

/** Quote a string index so the concrete path re-parses as a path. */
function quoteKey(key: string): string {
  const escaped = key
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t');
  return `"${escaped}"`;
}

/** Resolve every segment to a literal key. Returns null when an index does
 *  not evaluate to an integer or a string. */
function resolveKeys(path: StatePath, scope: StateScope): Array<string | number> | null {
  const keys: Array<string | number> = [path.root];
  for (const seg of path.segments) {
    if (seg.t === 'member') {
      keys.push(seg.prop);
      continue;
    }
    const idx = evalExprAst(seg.idx, scope);
    if (typeof idx === 'string' || (typeof idx === 'number' && Number.isInteger(idx))) {
      keys.push(idx);
    } else {
      return null;
    }
  }
  return keys;
}

/** Evaluate a path's [index] expressions against a scope (including for:each
 *  loop bindings), producing the concrete path renderers close over:
 *  files[i].checked with i = 2 becomes files[2].checked. */
export function resolveStatePath(path: StatePath, scope: StateScope): string {
  const keys = resolveKeys(path, scope);
  if (keys === null) {
    throw new ExprError('state path index did not evaluate to an integer or a string');
  }
  let out = path.root;
  path.segments.forEach((seg, i) => {
    const key = keys[i + 1] as string | number;
    if (seg.t === 'member') out += `.${key}`;
    else out += typeof key === 'number' ? `[${key}]` : `[${quoteKey(key)}]`;
  });
  return out;
}

function lookup(scope: StateScope, concrete: string): { found: boolean; value: ExprValue } {
  const keys = resolveKeys(parseStatePath(concrete), scope);
  if (keys === null) return { found: false, value: null };
  let value: ExprValue = scope;
  for (const key of keys) {
    if (typeof key === 'number') {
      if (!Array.isArray(value) || key < 0 || key >= value.length) {
        return { found: false, value: null };
      }
      value = value[key] ?? null;
    } else {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        return { found: false, value: null };
      }
      if (!(key in value)) return { found: false, value: null };
      value = value[key] ?? null;
    }
  }
  return { found: true, value };
}

/** Read a path from a scope. Identical to expr member/index evaluation: a
 *  missing segment yields null. */
export function readStatePath(scope: StateScope, concrete: string): ExprValue {
  return lookup(scope, concrete).value;
}

/** Whether the path's leaf exists in the scope (present, possibly null).
 *  Internal to resolve - bind:state only fills a control's value from state
 *  the artifact actually declares. Not re-exported from the package index. */
export function hasStatePath(scope: StateScope, concrete: string): boolean {
  return lookup(scope, concrete).found;
}

/** Write a path copy-on-write: clone every container along the path, assign
 *  the leaf, leave every untouched sibling shared by reference. A write
 *  through a missing or mismatched container returns the scope unchanged plus
 *  one console.warn - writes never invent structure. New keys on an existing
 *  record are allowed (flat root writes always were); arrays only accept
 *  in-range indices. */
export function writeStatePath(scope: StateScope, concrete: string, value: ExprValue): StateScope {
  const keys = resolveKeys(parseStatePath(concrete), scope);
  const ignore = (): StateScope => {
    console.warn(
      `[mosaic] write to state path '${concrete}' ignored: missing or mismatched container`,
    );
    return scope;
  };
  if (keys === null) return ignore();

  const next: StateScope = { ...scope };
  let container: Record<string, ExprValue> | ExprValue[] = next;
  for (const key of keys.slice(0, -1)) {
    const child: ExprValue = Array.isArray(container)
      ? typeof key === 'number'
        ? (container[key] ?? null)
        : null
      : typeof key === 'string'
        ? (container[key] ?? null)
        : null;
    if (child === null || typeof child !== 'object') return ignore();
    const clone: Record<string, ExprValue> | ExprValue[] = Array.isArray(child)
      ? [...child]
      : { ...child };
    if (Array.isArray(container)) container[key as number] = clone;
    else container[key as string] = clone;
    container = clone;
  }

  const leaf = keys[keys.length - 1] as string | number;
  if (Array.isArray(container)) {
    if (typeof leaf !== 'number' || leaf < 0 || leaf >= container.length) return ignore();
    container[leaf] = value;
  } else {
    if (typeof leaf !== 'string') return ignore();
    container[leaf] = value;
  }
  return next;
}
