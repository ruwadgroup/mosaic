// The block registry (docs/proposal.md §4.1, §4.4): createRegistry turns a
// list of BlockDefinitions - built-in, host-defined, or both - into the single
// object that validation, introspection (ls/cat), and macro expansion consult.
// Construction is fail-fast: a registry that constructs is a registry the
// model can trust.

import {
  MOSAIC_VERSION,
  type MosaicDocument,
  type MosaicNode,
  type PropValue,
  TEXT_TYPE,
  isExprRef,
} from './ast.js';
import { defaultBlock, defaultBlocks } from './blocks.js';
import { exprDependencies } from './expr.js';
import { JsxError, parseJsx } from './jsx.js';
import { DEFAULT_MANIFEST } from './manifest.js';
import { type StateScope, resolve } from './resolve.js';
import type { BlockDefinition, BlockKind, PropSpec, PropTypeName } from './schema.js';
import { parseStatePath } from './state-path.js';
import { parseForEach, validateDocument } from './validate.js';

/** The data half of a definition: what toJSON() emits. `decompose` is a
 *  function and does not serialize; createRegistry rehydrates it for built-ins
 *  (a JSON block whose data matches a default block gets the default's
 *  decompose back). */
export type BlockDefinitionJson = Omit<BlockDefinition, 'decompose'>;

/** The serialized form of a registry: safe to JSON.stringify and feed back
 *  to createRegistry for round-trip identity. */
export type RegistryJson = { blocks: BlockDefinitionJson[] };

/** The live registry object: the single source of truth consulted by
 *  validation, introspection (ls/cat), macro expansion, and the AI adapters.
 *  Constructed via createRegistry; the DEFAULT_REGISTRY covers every built-in. */
export type MosaicRegistry = {
  /** Every block, in registration order. */
  readonly blocks: readonly BlockDefinition[];
  get(name: string): BlockDefinition | undefined;
  has(name: string): boolean;
  /** Plain-data form, safe to JSON.stringify and feed back to createRegistry.
   *  Decompose functions are dropped (see BlockDefinitionJson). */
  toJSON(): RegistryJson;
};

const NAME_RE = /^[A-Z][A-Za-z0-9]*$/;
const KINDS: ReadonlySet<string> = new Set([
  'layout',
  'content',
  'control',
  'structure',
  'media',
  'data',
]);
const PROP_TYPES: ReadonlySet<string> = new Set([
  'string',
  'number',
  'boolean',
  'enum',
  'string[]',
  'number[]',
  'string[][]',
  'record[]',
  'record',
  'json',
] satisfies PropTypeName[]);

function fail(block: string, problem: string): never {
  throw new Error(`mosaic: block "${block}" ${problem}`);
}

function dataHalf(def: BlockDefinition): BlockDefinitionJson {
  const { decompose: _decompose, ...data } = def;
  return data;
}

/** Structural equality over JSON-shaped values (definitions carry no
 *  functions in their data half, so this is exact). */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i]));
  }
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const ak = Object.keys(a).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
  const bk = Object.keys(b).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
  if (ak.length !== bk.length) return false;
  return ak.every((k) =>
    deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
  );
}

function checkPropSpecs(block: string, path: string, specs: Readonly<Record<string, PropSpec>>) {
  for (const [name, spec] of Object.entries(specs)) {
    const at = path === '' ? name : `${path}.${name}`;
    if (!PROP_TYPES.has(spec.type)) fail(block, `prop "${at}" has unknown type "${spec.type}"`);
    if (typeof spec.doc !== 'string' || spec.doc.trim() === '') {
      fail(block, `prop "${at}" needs a non-empty doc`);
    }
    if (spec.type === 'enum' && (!Array.isArray(spec.values) || spec.values.length === 0)) {
      fail(block, `prop "${at}" is an enum and needs a non-empty values list`);
    }
    if (spec.shape) checkPropSpecs(block, at, spec.shape);
  }
}

const templateCache = new Map<string, MosaicNode>();

function parseTemplate(source: string): MosaicNode {
  const cached = templateCache.get(source);
  if (cached) return cached;
  const template = parseJsx(source);
  if (templateCache.size > 200) templateCache.clear();
  templateCache.set(source, template);
  return template;
}

/** Every expression a template evaluates may reference only declared prop
 *  names plus `children` (and names bound by an enclosing for:each). */
function checkTemplateRefs(block: string, root: MosaicNode, declared: ReadonlySet<string>): void {
  const checkExpr = (source: string, allowed: ReadonlySet<string>): void => {
    for (const dep of exprDependencies(source)) {
      if (!allowed.has(dep)) {
        fail(block, `expandsTo references "${dep}", which is not a declared prop or children`);
      }
    }
  };
  const checkValue = (value: PropValue, allowed: ReadonlySet<string>): void => {
    if (isExprRef(value)) {
      checkExpr(value.$expr, allowed);
    } else if (Array.isArray(value)) {
      for (const v of value) checkValue(v, allowed);
    } else if (value !== null && typeof value === 'object') {
      for (const v of Object.values(value)) checkValue(v, allowed);
    }
  };
  const visit = (node: MosaicNode, outer: ReadonlySet<string>): void => {
    let allowed = outer;
    const directives = node.directives ?? {};
    const forEach = directives['for:each'];
    if (typeof forEach === 'string') {
      const parsed = parseForEach(forEach);
      if (parsed) {
        checkExpr(parsed.expr, outer);
        const inner = new Set(outer);
        inner.add(parsed.binding);
        if (parsed.index !== undefined) inner.add(parsed.index);
        allowed = inner;
      }
    }
    if (node.type === TEXT_TYPE) {
      const value = node.props?.value;
      if (isExprRef(value)) checkExpr(value.$expr, allowed);
      return;
    }
    for (const value of Object.values(node.props ?? {})) checkValue(value, allowed);
    for (const name of ['if:show', 'from:expr'] as const) {
      const value = directives[name];
      if (typeof value === 'string') checkExpr(value, allowed);
    }
    for (const name of ['bind:state', 'from:state'] as const) {
      const value = directives[name];
      if (typeof value === 'string') {
        try {
          checkExpr(parseStatePath(value).root, allowed);
        } catch {
          // an unparsable path is validate's diagnostic, not a template-ref error
        }
      }
    }
    if (isExprRef(directives.key)) checkExpr(directives.key.$expr, allowed);
    for (const action of Object.values(directives['on:event'] ?? {})) {
      if (typeof action === 'object' && action !== null) {
        for (const arg of Object.values(action.args ?? {})) checkValue(arg, allowed);
      }
    }
    for (const child of node.children ?? []) visit(child, allowed);
    for (const slot of Object.values(node.slots ?? {})) {
      for (const child of slot) visit(child, allowed);
    }
  };
  visit(root, declared);
}

/** Build a registry from block definitions (or a toJSON() round-trip of one).
 *
 *  Fail-fast: names must be PascalCase and unique; a name that matches a
 *  built-in must carry the built-in's exact data (it is substituted with the
 *  built-in, restoring its decompose recipe); every prop needs a doc; every
 *  `example` must parse and validate against this registry; every `expandsTo`
 *  must parse and reference only declared props plus `children`. Throws an
 *  Error naming the block and the problem. */
export function createRegistry(input: readonly BlockDefinition[] | RegistryJson): MosaicRegistry {
  const list: readonly BlockDefinition[] = 'blocks' in input ? input.blocks : input;
  const byName = new Map<string, BlockDefinition>();

  for (const given of list) {
    let def = given;
    if (typeof def?.name !== 'string' || !NAME_RE.test(def.name)) {
      throw new Error(`mosaic: block name "${String(def?.name)}" must be PascalCase`);
    }
    if (byName.has(def.name)) fail(def.name, 'is declared twice in the registry');
    const builtIn = defaultBlock(def.name);
    if (builtIn && def !== builtIn) {
      if (!deepEqual(dataHalf(def), dataHalf(builtIn))) {
        fail(def.name, 'redefines a built-in block; built-ins cannot be shadowed');
      }
      def = builtIn;
    }
    if (!KINDS.has(def.kind)) fail(def.name, `has unknown kind "${String(def.kind)}"`);
    if (typeof def.doc !== 'string' || def.doc.trim() === '') fail(def.name, 'needs a doc');
    checkPropSpecs(def.name, '', def.props ?? {});
    if (typeof def.example !== 'string' || def.example.trim() === '') {
      fail(def.name, 'needs an example');
    }
    if (def.expandsTo !== undefined) {
      let template: MosaicNode;
      try {
        template = parseTemplate(def.expandsTo);
      } catch (e) {
        fail(
          def.name,
          `expandsTo does not parse: ${e instanceof JsxError ? e.message : String(e)}`,
        );
      }
      checkTemplateRefs(def.name, template, new Set([...Object.keys(def.props), 'children']));
    }
    byName.set(def.name, def);
  }

  const blocks = [...byName.values()];
  const registry: MosaicRegistry = {
    blocks,
    get: (name) => byName.get(name),
    has: (name) => byName.has(name),
    toJSON: () => ({ blocks: blocks.map(dataHalf) }),
  };

  // Examples validate against the finished registry, so they may compose any
  // block in it (strict: an unknown tag in an example is an error).
  const exampleManifest = {
    ...DEFAULT_MANIFEST,
    strict: true,
    components_supported: blocks.map((b) => b.name),
  };
  for (const def of blocks) {
    let root: MosaicNode;
    try {
      root = parseJsx(def.example);
    } catch (e) {
      fail(def.name, `example does not parse: ${e instanceof JsxError ? e.message : String(e)}`);
    }
    const doc: MosaicDocument = { mosaic_version: MOSAIC_VERSION, id: 'example', root };
    const result = validateDocument(doc, exampleManifest, registry);
    if (!result.ok) {
      const first = result.errors[0];
      fail(
        def.name,
        `example does not validate: ${first?.code}${first?.prop ? ` (${first.prop})` : ''}${first?.fix ? ` - ${first.fix}` : ''}`,
      );
    }
  }

  return registry;
}

/** The full standard registry containing every built-in block from defaultBlocks.
 *  Use this wherever host vocabulary is not needed. */
export const DEFAULT_REGISTRY: MosaicRegistry = createRegistry(defaultBlocks);

/** Marks a `{children}` passthrough slot between template parse and resolve,
 *  so the evaluator never sees `children` as an identifier. */
const CHILDREN_SLOT = '#children';

function markChildrenSlots(node: MosaicNode): MosaicNode {
  if (node.type === TEXT_TYPE) {
    const value = node.props?.value;
    if (isExprRef(value) && value.$expr === 'children') return { type: CHILDREN_SLOT };
    return node;
  }
  if (node.children) node.children = node.children.map(markChildrenSlots);
  for (const [name, slot] of Object.entries(node.slots ?? {})) {
    (node.slots as Record<string, MosaicNode[]>)[name] = slot.map(markChildrenSlots);
  }
  return node;
}

function spliceChildren(node: MosaicNode, replacement: readonly MosaicNode[]): MosaicNode {
  const out: MosaicNode = { ...node };
  if (node.children) {
    out.children = node.children.flatMap((child) =>
      child.type === CHILDREN_SLOT ? [...replacement] : [spliceChildren(child, replacement)],
    );
  }
  if (node.slots) {
    const slots: Record<string, MosaicNode[]> = {};
    for (const [name, slot] of Object.entries(node.slots)) {
      slots[name] = slot.flatMap((child) =>
        child.type === CHILDREN_SLOT ? [...replacement] : [spliceChildren(child, replacement)],
      );
    }
    out.slots = slots;
  }
  return out;
}

/** Expand a node through its block's `expandsTo` template, or return null when
 *  the node's type has no macro. The node's props must already be concrete
 *  (resolve the document first): they become the template's expression scope,
 *  and `{children}` slots receive the node's children. */
export function expandMacro(node: MosaicNode, registry: MosaicRegistry): MosaicNode | null {
  const expandsTo = registry.get(node.type)?.expandsTo;
  if (expandsTo === undefined) return null;
  const template = markChildrenSlots(structuredClone(parseTemplate(expandsTo)));
  const doc: MosaicDocument = {
    mosaic_version: MOSAIC_VERSION,
    id: `${node.type}-macro`,
    root: template,
  };
  const scope = { ...(node.props ?? {}) } as StateScope;
  const resolved = resolve(doc, DEFAULT_MANIFEST, scope);
  return spliceChildren(resolved.root, node.children ?? []);
}

/** One line of ls output: the name, kind, one-line doc, and whether the block
 *  is host-defined (not in defaultBlocks). */
export type BlockListing = {
  name: string;
  kind: BlockKind;
  doc: string;
  /** True for blocks that are not part of defaultBlocks, so tools can mark
   *  host-defined vocabulary. */
  host: boolean;
};

/** ls: every block in the registry (name, kind, one-liner), grouped by kind. */
export function listBlocks(registry: MosaicRegistry = DEFAULT_REGISTRY): BlockListing[] {
  return registry.blocks
    .map((b) => ({
      name: b.name,
      kind: b.kind,
      doc: b.doc,
      host: defaultBlock(b.name) === undefined,
    }))
    .sort((a, b) =>
      a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind.localeCompare(b.kind),
    );
}

/** The full cat output for one block: schema and example.
 *  describeBlock returns this; AI adapters format it into model-facing text. */
export type BlockDescription = {
  name: string;
  kind: BlockKind;
  doc: string;
  rich: boolean;
  rendersChildren: boolean;
  props: Array<{ name: string } & PropSpec>;
  requiredProps: string[];
  example: string;
};

/** cat: the full schema for one block, or undefined if not in the registry. */
export function describeBlock(
  name: string,
  registry: MosaicRegistry = DEFAULT_REGISTRY,
): BlockDescription | undefined {
  const def = registry.get(name);
  if (!def) return undefined;
  const props = Object.entries(def.props).map(([propName, p]) => ({ name: propName, ...p }));
  return {
    name: def.name,
    kind: def.kind,
    doc: def.doc,
    rich: def.rich ?? false,
    rendersChildren: def.children ?? false,
    props,
    requiredProps: props.filter((p) => p.required).map((p) => p.name),
    example: def.example,
  };
}
