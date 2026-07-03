// @mosaicjs/ai - framework-neutral introspection core for Mosaic.
//
// Provides registry-aware lsBlocks/catBlock/validateSource handlers and
// mosaicToolDescriptors (the three canonical tools as framework-neutral
// descriptors). Subpaths wire these into specific frameworks: /vercel,
// /mcp, /prompt. Implements spec 003 §C.

import {
  DEFAULT_MANIFEST,
  DEFAULT_REGISTRY,
  type MosaicRegistry,
  type PropSpec,
  describeBlock,
  listBlocks,
  parse,
  validate,
} from '@mosaicjs/core';

export type { MosaicRegistry } from '@mosaicjs/core';

/** Raw JSON Schema for a tool input (always type: "object"). */
export type JsonSchema = {
  type: 'object';
  properties: Record<string, { type: string; description: string }>;
  required?: string[];
  additionalProperties?: boolean;
};

/** A framework-neutral tool descriptor: name, description, input schema, and
 *  a pure string-returning handler. No I/O. */
export type MosaicTool = {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  /** Executes the tool against already-validated input. Returns plain text. */
  handler: (args: Record<string, unknown>) => string;
};

const KIND_ORDER = ['layout', 'content', 'control', 'structure', 'media', 'data'];

/** The block catalog grouped by kind, one line per block.
 *  Host blocks (not in defaultBlocks) receive a " (host)" suffix. */
export function lsBlocks(kind?: string, registry: MosaicRegistry = DEFAULT_REGISTRY): string {
  const wanted = kind?.trim().toLowerCase();
  const blocks = listBlocks(registry).filter((b) => !wanted || b.kind === wanted);
  if (blocks.length === 0) {
    return `No blocks${wanted ? ` of kind "${kind}"` : ''}. Kinds: ${KIND_ORDER.join(', ')}.`;
  }
  const groups = new Map<string, string[]>();
  for (const b of blocks) {
    const suffix = b.host ? ' (host)' : '';
    const line = `  ${b.name}${suffix} - ${b.doc}`;
    const list = groups.get(b.kind);
    if (list) list.push(line);
    else groups.set(b.kind, [line]);
  }
  const sections: string[] = [];
  for (const k of KIND_ORDER) {
    const ls = groups.get(k);
    if (ls && ls.length > 0) sections.push(`${k}:\n${ls.sort().join('\n')}`);
  }
  return [
    "Mosaic blocks. Call mosaic_cat <block> for a block's full prop schema and an example.",
    '',
    ...sections,
  ].join('\n');
}

function propLine(name: string, spec: PropSpec): string {
  const req = spec.required ? ' (required)' : '';
  const values = spec.type === 'enum' && spec.values ? ` [${spec.values.join(' | ')}]` : '';
  const nested =
    spec.shape !== undefined
      ? ` { ${Object.entries(spec.shape)
          .map(([k, v]) => `${k}: ${v.type}${v.required ? '!' : ''}`)
          .join(', ')} }`
      : '';
  return `  ${name}: ${spec.type}${values}${nested}${req} - ${spec.doc}`;
}

const INTERACTIVITY_NOTE =
  'Interactivity (any block): value={path} / checked={path} two-way binds state on a control; ' +
  '{cond && <El … />} renders conditionally; {list.map((item) => <El … />)} repeats; ' +
  'onClick={intentName({ …args })} hands the host an intent (set(path, expression) / toggle(path) mutate locally; set evaluates its expression against current state at event time); key={...} gives repeated items identity.';

function catOne(name: string, registry: MosaicRegistry): string {
  const d = describeBlock(name, registry);
  if (!d) {
    return `Unknown block "${name}". Run mosaic_ls to list every block.`;
  }
  const props =
    d.props.length > 0 ? d.props.map((p) => propLine(p.name, p)).join('\n') : '  (no props)';
  return [
    `${d.name} - ${d.doc}`,
    `kind: ${d.kind}${d.rich ? ' (rich; decomposes to primitives where unsupported)' : ''}${
      d.rendersChildren ? ', renders children' : ''
    }`,
    '',
    'props:',
    props,
    '',
    'example:',
    d.example
      .split('\n')
      .map((l) => `  ${l}`)
      .join('\n'),
  ].join('\n');
}

/** Schemas for one or more blocks (comma- or space-separated): props (type,
 *  enum values, nested shapes, required) and a minimal example each. */
export function catBlock(names: string, registry: MosaicRegistry = DEFAULT_REGISTRY): string {
  const wanted = names.split(/[\s,]+/).filter((n) => n.length > 0);
  if (wanted.length === 0) {
    return 'Pass one or more block names, e.g. "DataTable, Chart". Run mosaic_ls to list every block.';
  }
  const sections = [...new Set(wanted)].map((n) => catOne(n, registry));
  return [...sections, INTERACTIVITY_NOTE].join('\n\n---\n\n');
}

/** Compile and validate mosaic-jsx, returning every error or confirming it is
 *  sound. The registry determines which blocks are valid. */
export function validateSource(
  source: string,
  registry: MosaicRegistry = DEFAULT_REGISTRY,
): string {
  const parsed = parse(source);
  if (!parsed.ok) {
    return [
      `INVALID - ${parsed.errors.length} compile error(s):`,
      ...parsed.errors.map((e) => `  ${e.line}:${e.column} ${e.code}: ${e.message}`),
    ].join('\n');
  }
  const result = validate(parsed.doc, DEFAULT_MANIFEST, { registry });
  if (!result.ok) {
    return [
      `INVALID - ${result.errors.length} error(s):`,
      ...result.errors.map(
        (e) =>
          `  ${e.path} <${e.type}> ${e.code}${e.prop ? ` (${e.prop})` : ''}${
            e.fix ? ` - ${e.fix}` : ''
          }`,
      ),
    ].join('\n');
  }
  const warnings = result.warnings.filter((w) => w.code !== 'UNSUPPORTED_BY_HOST');
  if (warnings.length > 0) {
    return [
      'VALID (with warnings):',
      ...warnings.map((w) => `  ${w.path} <${w.type}> ${w.code}${w.fix ? ` - ${w.fix}` : ''}`),
    ].join('\n');
  }
  return 'VALID - the artifact compiles and passes validation.';
}

/** The three Mosaic introspection tools as framework-neutral descriptors, closed
 *  over the registry so host blocks appear in all outputs. */
export function mosaicToolDescriptors(
  registry: MosaicRegistry = DEFAULT_REGISTRY,
): readonly MosaicTool[] {
  return [
    {
      name: 'mosaic_ls',
      description:
        'List every Mosaic block you can compose from, grouped by kind. Call this first when building a Mosaic artifact to see what is available. Pass kind to narrow to one group.',
      inputSchema: {
        type: 'object',
        properties: {
          kind: {
            type: 'string',
            description: 'Optional: one of layout, content, control, structure, data.',
          },
        },
        additionalProperties: false,
      },
      handler: (args) =>
        lsBlocks(args.kind === undefined ? undefined : String(args.kind), registry),
    },
    {
      name: 'mosaic_cat',
      description:
        'Show the full prop schema for one or more Mosaic blocks - prop names, types, enum values, nested shapes, which are required - plus a minimal example each. Call this once with every block you are unsure about (e.g. "DataTable, Chart, Stack") so you write the exact schema instead of guessing.',
      inputSchema: {
        type: 'object',
        properties: {
          block: {
            type: 'string',
            description:
              'One or more block names, comma- or space-separated, e.g. "DataTable, Chart".',
          },
        },
        required: ['block'],
        additionalProperties: false,
      },
      handler: (args) => catBlock(String(args.block ?? ''), registry),
    },
    {
      name: 'mosaic_validate',
      description:
        'Compile and validate a Mosaic artifact (the mosaic-jsx inside a ```mosaic fence, or the bare source) and return every error, or confirm it is sound. Run this on your draft before emitting so mistakes are caught and fixed first.',
      inputSchema: {
        type: 'object',
        properties: {
          source: { type: 'string', description: 'The mosaic-jsx source to validate.' },
        },
        required: ['source'],
        additionalProperties: false,
      },
      handler: (args) => validateSource(String(args.source ?? ''), registry),
    },
  ];
}

/** Look up a tool by name and run it against the registry. Throws on unknown tool. */
export function runMosaicTool(
  name: string,
  args: Record<string, unknown>,
  registry: MosaicRegistry = DEFAULT_REGISTRY,
): string {
  const t = mosaicToolDescriptors(registry).find((d) => d.name === name);
  if (!t) throw new Error(`unknown mosaic tool: ${name}`);
  return t.handler(args);
}
