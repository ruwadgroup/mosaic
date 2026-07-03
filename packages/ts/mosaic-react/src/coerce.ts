// Prop coercion (docs/proposal.md §4.1): narrow each resolved prop to the shape
// its PropSpec promises before a host component sees it. A host never writes
// str()/num() guards, and a wrong-shaped value becomes undefined rather than
// raw JSON in the UI. Undeclared props pass through untouched.

import type { BlockDefinition, PropSpec, PropValue } from '@mosaicjs/core';

function isPlainObject(v: PropValue): v is Record<string, PropValue> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Stringify a scalar; objects and arrays have no string form and coerce out. */
function toStringOr(v: PropValue): string | undefined {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return undefined;
}

function toNumberOr(v: PropValue): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

/** Coerce one resolved value against its PropSpec. Returns undefined when the
 *  value cannot be made to fit (out-of-enum, wrong-shaped scalar/object). */
function coerceValue(value: PropValue, spec: PropSpec): PropValue | undefined {
  switch (spec.type) {
    case 'string':
      return toStringOr(value);
    case 'number':
      return toNumberOr(value);
    case 'boolean':
      return typeof value === 'boolean' ? value : undefined;
    case 'enum':
      return typeof value === 'string' && spec.values?.includes(value) ? value : undefined;
    case 'string[]':
      if (!Array.isArray(value)) return undefined;
      return value.map(toStringOr).filter((el): el is string => el !== undefined);
    case 'number[]':
      if (!Array.isArray(value)) return undefined;
      return value.map(toNumberOr).filter((el): el is number => el !== undefined);
    case 'string[][]':
      if (!Array.isArray(value)) return undefined;
      return value
        .filter(Array.isArray)
        .map((row) => row.map(toStringOr).filter((el): el is string => el !== undefined));
    case 'record[]':
      if (!Array.isArray(value)) return undefined;
      return value.filter(isPlainObject);
    case 'record':
      return isPlainObject(value) ? value : undefined;
    case 'json':
      return value;
  }
}

/** Coerce every declared prop of a resolved node against the block's schema.
 *  Props the schema does not declare pass through unchanged (custom escape
 *  hatch). The result is the exact prop record a host component receives. */
export function coerceProps(
  props: Readonly<Record<string, PropValue>>,
  def: BlockDefinition,
): Record<string, PropValue> {
  const out: Record<string, PropValue> = {};
  for (const [name, value] of Object.entries(props)) {
    const spec = def.props[name];
    if (!spec) {
      out[name] = value;
      continue;
    }
    const coerced = coerceValue(value, spec);
    if (coerced !== undefined) out[name] = coerced;
  }
  return out;
}
