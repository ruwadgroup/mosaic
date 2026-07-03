// @mosaicjs/react - the headless Mosaic runtime (docs/proposal.md §7.2).
//
// parse, resolve, state, streaming, intents, and coercion, with the <Mosaic>
// component and a render() form. A host supplies components and owns the
// entire look. State lives in one store; every
// state change re-resolves the artifact, so derived values, if:show, and
// for:each recompute locally and only named host intents leave through onIntent.
// No eval, no Function, no dangerouslySetInnerHTML.

import {
  type ActionRef,
  type BlockDefinition,
  type BlockPropTypes,
  DEFAULT_MANIFEST,
  DEFAULT_REGISTRY,
  type ExprValue,
  type HostManifest,
  type InferBlockProps,
  type MosaicDocument,
  type MosaicNode,
  type MosaicRegistry,
  type PropValue,
  type StateScope,
  TEXT_TYPE,
  type ValidationDiagnostic,
  expandMacro,
  initialState,
  isExprRef,
  parse,
  readStatePath,
  resolve,
  validate,
  writeStatePath,
} from '@mosaicjs/core';
import * as React from 'react';
import { coerceProps } from './coerce.js';

export { coerceProps } from './coerce.js';
export { layoutDiagram } from './diagram-layout.js';
export type {
  DiagramLayout,
  DiagramLayoutEdge,
  DiagramLayoutInput,
  DiagramLayoutRect,
} from './diagram-layout.js';
export type {
  HostManifest,
  MosaicDocument,
  MosaicRegistry,
  ValidationDiagnostic,
} from '@mosaicjs/core';

/** The host-intent sink: every on:event that is not a local state.* mutation
 *  lands here as a named intent with its resolved args. */
export type OnIntent = (name: string, args?: unknown) => void | Promise<void>;

/** What a host's block component receives. Handing these in is how the host
 *  owns the design while the runtime owns the reactive loop. Props are already
 *  resolved and coerced to the block's schema shape. */
export type MosaicBlockProps<P = Record<string, PropValue>> = {
  node: MosaicNode;
  /** Resolved, schema-coerced props. */
  props: P;
  /** Rendered children, in order. */
  children: React.ReactNode[];
  /** The bound state value, when the node carries bind:state. */
  value?: unknown;
  /** Writes the bound state key; present only when bind:state is set. */
  setValue?: (v: unknown) => void;
  /** One ready-to-attach callback per on:event entry, keyed by event name. */
  events: Record<string, () => void>;
};

// A single map type carries both exactly-typed built-in components and
// custom-block components; props are widened here so the two share one map.
// biome-ignore lint/suspicious/noExplicitAny: props variance across a shared component map
export type MosaicComponent = React.ComponentType<MosaicBlockProps<any>>;

/** Per-block components, keyed by block type; the host's design lives here. */
export type MosaicComponents = Record<string, MosaicComponent>;

/** Identity helper that types a components map: built-in block names get their
 *  exact resolved-prop shape, and unknown keys (custom blocks) are allowed. */
export function defineComponents<
  const T extends Partial<{
    [K in keyof BlockPropTypes]: React.ComponentType<MosaicBlockProps<BlockPropTypes[K]>>;
  }> &
    Record<string, MosaicComponent>,
>(map: T): T {
  return map;
}

/** A custom block bound to a component: its schema (register via createRegistry)
 *  and a one-entry component map (spread into <Mosaic components>). */
export type DefinedBlock<Def extends BlockDefinition> = {
  schema: Def;
  component: Record<Def['name'], React.ComponentType<MosaicBlockProps<InferBlockProps<Def>>>>;
};

/** Bind a component to a custom block schema, its props typed from that schema.
 *  The schema alone renders through a macro; this is the native-component
 *  escape hatch. Returns { schema, component } so a host can spread both. */
export function defineBlock<const Def extends BlockDefinition>(
  schema: Def,
  component: React.ComponentType<MosaicBlockProps<InferBlockProps<Def>>>,
): DefinedBlock<Def> {
  return {
    schema,
    component: { [schema.name]: component } as DefinedBlock<Def>['component'],
  };
}

/** The <Mosaic> props. `source` is inline mosaic-jsx/json or a parsed document;
 *  `components` supplies the host's look; everything else is optional. */
export type MosaicProps = {
  source: string | MosaicDocument;
  components: MosaicComponents;
  /** Host vocabulary (built-ins merged in). Defaults to DEFAULT_REGISTRY. */
  registry?: MosaicRegistry;
  /** Treat a string source as a streaming prefix: render progressively, and
   *  quietly show the raw source until anything is renderable. */
  isStreaming?: boolean;
  onIntent?: OnIntent;
  /** Advisory validation sink, fired once per distinct source. */
  onDiagnostics?: (diagnostics: ValidationDiagnostic[]) => void;
  /** Rendered for source that does not parse; defaults to a plain <pre>. */
  fallback?: (source: string) => React.ReactNode;
  /** Host capabilities and policy. Defaults to DEFAULT_MANIFEST. */
  manifest?: HostManifest;
};

const h = React.createElement;

type Dispatch = (action: ActionRef, resolvedArgs?: Record<string, unknown>) => void;

type RenderContext = {
  manifest: HostManifest;
  registry: MosaicRegistry;
  state: StateScope;
  setKey: (key: string, value: unknown) => void;
  dispatch: Dispatch;
  components: MosaicComponents;
};

// A throwing component degrades to a fallback (its own children, or nothing)
// instead of crashing the whole artifact.

type BoundaryProps = { fallback: React.ReactNode; children?: React.ReactNode };

class ErrorBoundary extends React.Component<BoundaryProps, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  override render(): React.ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

// args were resolved against state during resolve(); they are plain values here.
function fireAction(ctx: RenderContext, action: ActionRef): void {
  if (typeof action === 'object' && action.args) {
    const args: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(action.args)) args[k] = isExprRef(v) ? undefined : v;
    ctx.dispatch(action, args);
    return;
  }
  ctx.dispatch(action);
}

function nodeEvents(node: MosaicNode, ctx: RenderContext): Record<string, () => void> {
  const events: Record<string, () => void> = {};
  for (const [event, action] of Object.entries(node.directives?.['on:event'] ?? {})) {
    events[event] = () => fireAction(ctx, action);
  }
  return events;
}

function renderChildren(node: MosaicNode, ctx: RenderContext, path: string): React.ReactNode[] {
  return (node.children ?? []).map((child, i) =>
    renderNode(child, ctx, child.directives?.key ? String(child.directives.key) : `${path}.${i}`),
  );
}

/** Precedence per node: the host's component, then the block's expandsTo macro,
 *  then a rich block's decompose recipe, then children in order for anything
 *  the host did not register (never a debug box). */
function renderNode(node: MosaicNode, ctx: RenderContext, key: string): React.ReactNode {
  if (node.type === TEXT_TYPE) {
    const value = node.props?.value;
    return h(React.Fragment, { key }, value === undefined || value === null ? '' : String(value));
  }

  const Custom = ctx.components[node.type];
  if (Custom) {
    const def = ctx.registry.get(node.type);
    const raw = node.props ?? {};
    const props = def ? coerceProps(raw, def) : { ...raw };
    const bind = node.directives?.['bind:state'];
    const children = renderChildren(node, ctx, key);
    const element = h(Custom, {
      node,
      props,
      children,
      value: bind ? readStatePath(ctx.state, bind) : undefined,
      setValue: bind ? (v: unknown) => ctx.setKey(bind, v) : undefined,
      events: nodeEvents(node, ctx),
    });
    return h(ErrorBoundary, { key, fallback: h(React.Fragment, null, ...children) }, element);
  }

  const expanded = expandMacro(node, ctx.registry);
  if (expanded) return h(React.Fragment, { key }, renderNode(expanded, ctx, `${key}.macro`));

  const def = ctx.registry.get(node.type);
  if (def?.rich && def.decompose) return renderNode(def.decompose(node), ctx, key);

  return h(React.Fragment, { key }, ...renderChildren(node, ctx, key));
}

type RuntimeProps = {
  doc: MosaicDocument;
  manifest: HostManifest;
  registry: MosaicRegistry;
  components: MosaicComponents;
  onIntent?: OnIntent;
};

function MosaicRuntime({
  doc,
  manifest,
  registry,
  components,
  onIntent,
}: RuntimeProps): React.ReactNode {
  const [state, setState] = React.useState<StateScope>(() => initialState(doc));

  // The single write choke point: keys are concrete state paths on resolved
  // nodes ("eggs", "files[2].checked"). writeStatePath copies on write.
  const setKey = React.useCallback((key: string, value: unknown) => {
    setState((s) => writeStatePath(s, key, value as ExprValue));
  }, []);

  const dispatch = React.useCallback<Dispatch>(
    (action, resolvedArgs) => {
      if (typeof action === 'string') {
        void onIntent?.(action, resolvedArgs);
        return;
      }
      // Local mutations: resolve() has already evaluated args.value against
      // current state, so set(count, count + 1) arrives as the next number.
      if (action.action === 'state.set') {
        const path = action.args?.path;
        if (typeof path === 'string') setKey(path, (resolvedArgs ?? action.args)?.value ?? null);
        return;
      }
      if (action.action === 'state.toggle') {
        const path = action.args?.path;
        if (typeof path === 'string') {
          setState((s) => writeStatePath(s, path, !readStatePath(s, path)));
        }
        return;
      }
      void onIntent?.(action.action, resolvedArgs ?? action.args);
    },
    [onIntent, setKey],
  );

  const resolved = resolve(doc, manifest, state);
  const ctx: RenderContext = { manifest, registry, state, setKey, dispatch, components };
  return renderNode(resolved.root, ctx, 'root');
}

type Parsed = { ok: true; doc: MosaicDocument } | { ok: false };

function parseSource(source: string | MosaicDocument, isStreaming: boolean | undefined): Parsed {
  if (typeof source !== 'string') return { ok: true, doc: source };
  const result = parse(source, isStreaming ? { streaming: true } : {});
  return result.ok ? { ok: true, doc: result.doc } : { ok: false };
}

/** Render a Mosaic artifact. Parsing is best-effort and validation is advisory:
 *  a validation error is reported through onDiagnostics but never blanks the
 *  artifact; only source that does not parse falls back. */
export function Mosaic(props: MosaicProps): React.ReactNode {
  const {
    source,
    components,
    registry = DEFAULT_REGISTRY,
    isStreaming,
    onIntent,
    onDiagnostics,
    fallback,
    manifest = DEFAULT_MANIFEST,
  } = props;

  const parsed = React.useMemo(() => parseSource(source, isStreaming), [source, isStreaming]);

  const reported = React.useRef<string | MosaicDocument | null>(null);
  React.useEffect(() => {
    if (!onDiagnostics || isStreaming || !parsed.ok || reported.current === source) return;
    reported.current = source;
    const result = validate(parsed.doc, manifest, { registry });
    const diagnostics = result.ok ? result.warnings : result.errors;
    if (diagnostics.length > 0) onDiagnostics(diagnostics);
  }, [source, isStreaming, parsed, onDiagnostics, manifest, registry]);

  if (!parsed.ok) {
    const text = typeof source === 'string' ? source : '';
    if (fallback) return h(React.Fragment, null, fallback(text));
    return h('pre', { style: { whiteSpace: 'pre-wrap', margin: 0 } }, text);
  }

  const sourceKey = typeof source === 'string' ? source : parsed.doc.id;
  return h(
    ErrorBoundary,
    { key: sourceKey, fallback: null },
    h(MosaicRuntime, { doc: parsed.doc, manifest, registry, components, onIntent }),
  );
}

/** The function form of <Mosaic>, for non-JSX call sites. */
export function render(props: MosaicProps): React.ReactElement {
  return h(Mosaic, props);
}
