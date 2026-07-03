// The block definition language (docs/proposal.md §4.1, §4.4): PropSpec, the
// six-form prop shape profile; BlockDefinition, the one plain-data shape every
// block (built-in or host-defined) is declared with; and the type-level
// inference that turns a props literal into its exact TypeScript shape.

import type { JsonLiteral, MosaicNode, PropValue } from './ast.js';

/** The six semantic categories a block belongs to; used for grouping in ls output. */
export type BlockKind = 'layout' | 'content' | 'control' | 'structure' | 'media' | 'data';

/** The six primitive prop types Mosaic supports. PropSpec is a strict profile of
 *  JSON Schema; this bounded set is exactly what the wire format can carry and
 *  what the model-facing cat output can describe. */
export type PropTypeName =
  | 'string'
  | 'number'
  | 'boolean'
  | 'enum'
  | 'string[]'
  | 'number[]'
  | 'string[][]' // array of string arrays (positional table rows)
  | 'record[]' // array of objects; element keys described by `shape`
  | 'record' // a single object; keys described by `shape`
  | 'json'; // any JSON-compatible literal

/** One prop declaration. Every declared prop must carry a non-empty `doc`;
 *  enum props must supply `values`; record props may supply a `shape` for
 *  element-level validation and cat output. */
export type PropSpec = {
  type: PropTypeName;
  /** One-line description shown by cat. */
  doc: string;
  required?: boolean;
  /** Allowed values for `enum`. */
  values?: readonly string[];
  /** Element/object shape for `record[]` and `record`. */
  shape?: Readonly<Record<string, PropSpec>>;
  /** An illustrative literal value, shown by cat. */
  example?: PropValue;
};

/** The declaration for one block (built-in or host-defined).
 *  The data half (everything but `decompose`) is serializable JSON, so a
 *  registry crosses any boundary: a web client to a tools server, a config
 *  file to a renderer, a wire. createRegistry validates every field at
 *  construction time, so a registry that constructs is a registry the model
 *  can trust. */
export type BlockDefinition = {
  /** PascalCase tag name, unique within a registry. */
  name: string;
  kind: BlockKind;
  /** One-line description for `ls`. */
  doc: string;
  /** Props by name. Directives (bind:state, on:event, if:show, for:each) are
   *  universal and documented separately, not per block. */
  props: Readonly<Record<string, PropSpec>>;
  /** A minimal mosaic-jsx example, shown by cat. Must validate against the
   *  registry the block is registered into. */
  example: string;
  /** Does the block render its children? */
  children?: boolean;
  /** Rich components decompose to primitives where unsupported. */
  rich?: boolean;
  /** The primitive expansion a renderer falls back to (invariant 8). A
   *  function, so it does not survive toJSON(). */
  decompose?: (node: MosaicNode) => MosaicNode;
  /** A mosaic-jsx macro template evaluated with the block's resolved props as
   *  the expression scope; a `{children}` text slot passes children through.
   *  May reference only declared prop names plus `children`. */
  expandsTo?: string;
};

/** Typed identity helper: declares a block while preserving the props literal
 *  (enum values, required flags) so InferBlockProps can compute the exact
 *  TypeScript shape. Structural checks happen later, in createRegistry. */
export function defineBlockSchema<const Def extends BlockDefinition>(def: Def): Def {
  return def;
}

// Mirrors scripts/gen-block-types.ts, which emits the same mapping as source
// text for the default blocks; the generated file asserts the two agree.

type Simplify<T> = { [K in keyof T]: T[K] };

type ShapeTsType<P extends PropSpec> = P['shape'] extends Readonly<Record<string, PropSpec>>
  ? InferProps<P['shape']>
  : Record<string, JsonLiteral>;

type PropTsType<P extends PropSpec> = P['type'] extends 'string'
  ? string
  : P['type'] extends 'number'
    ? number
    : P['type'] extends 'boolean'
      ? boolean
      : P['type'] extends 'enum'
        ? P['values'] extends readonly string[]
          ? P['values'][number]
          : string
        : P['type'] extends 'string[]'
          ? string[]
          : P['type'] extends 'number[]'
            ? number[]
            : P['type'] extends 'string[][]'
              ? string[][]
              : P['type'] extends 'record[]'
                ? Array<ShapeTsType<P>>
                : P['type'] extends 'record'
                  ? ShapeTsType<P>
                  : JsonLiteral;

type RequiredKeys<S extends Readonly<Record<string, PropSpec>>> = {
  [K in keyof S]: S[K] extends { required: true } ? K : never;
}[keyof S];

type InferProps<S extends Readonly<Record<string, PropSpec>>> = Simplify<
  { [K in RequiredKeys<S>]: PropTsType<S[K]> } & {
    [K in Exclude<keyof S, RequiredKeys<S>>]?: PropTsType<S[K]>;
  }
>;

/** The TypeScript shape of a block's resolved props, inferred from its props
 *  literal: enum values become unions, `required` controls optionality, and
 *  `shape` recurses. A block with no props infers Record<string, never>. */
export type InferBlockProps<Def extends Pick<BlockDefinition, 'props'>> =
  keyof Def['props'] extends never ? Record<string, never> : InferProps<Def['props']>;
