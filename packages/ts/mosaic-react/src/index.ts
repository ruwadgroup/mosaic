// @mosaic/react - the reference web renderer.
//
// render() is parse -> validate -> resolve -> a React subtree from a registry
// of reference blocks. State lives in one React store; every state change
// re-resolves the artifact, which is the whole reactive loop: derived values,
// if:show, and for:each recompute locally, and only named host intents leave
// through onAction. No eval, no Function, no dangerouslySetInnerHTML.
// See docs/proposal.md §7.2.

import {
  type ActionRef,
  DEFAULT_MANIFEST,
  DEFAULT_THEME,
  type ExprValue,
  type HostManifest,
  JsxError,
  type MosaicDocument,
  type MosaicNode,
  type PropValue,
  type StateScope,
  TEXT_TYPE,
  type Theme,
  blockSpec,
  initialState,
  isExprRef,
  isTokenRef,
  parse,
  readStatePath,
  resolve,
  resolveToken,
  validate,
  writeStatePath,
} from '@mosaic/core';
import * as React from 'react';
import { layoutDiagram } from './diagram-layout.js';

export { layoutDiagram } from './diagram-layout.js';
export type {
  DiagramLayout,
  DiagramLayoutEdge,
  DiagramLayoutInput,
  DiagramLayoutRect,
} from './diagram-layout.js';

export type OnAction = (action: string, args?: unknown) => void | Promise<void>;

export type RenderOptions = {
  /** The host's capabilities and policy. Defaults to DEFAULT_MANIFEST. */
  manifest?: HostManifest;
  /** Token→value map for the reference blocks. Defaults to DEFAULT_THEME.
   *  A host that swaps in its own components ignores this. */
  theme?: Theme;
  /** The host's own block components, by type. Any block found here renders
   *  through the host's implementation; everything else falls back to the
   *  reference blocks. This is how the host owns the entire design. */
  components?: MosaicComponents;
  /** Host-intent sink: every on:event that is not a local state.* mutation lands
   *  here as a named intent. The artifact never acts on its own. */
  onAction?: OnAction;
  /** Explicit wire hint; otherwise auto-detected. */
  format?: 'jsx' | 'json';
  /** Fail on unknown tags rather than rendering a debug Box. */
  strict?: boolean;
};

export type MosaicElement = React.ReactElement;

/** What a host's own block component receives. Handing these in is how the
 *  host owns the design while the renderer keeps owning the reactive loop. */
export type MosaicBlockProps = {
  node: MosaicNode;
  /** Resolved props: exprs already evaluated, token refs mapped via the theme. */
  props: Record<string, PropValue>;
  /** Rendered children, in order. */
  children: React.ReactNode[];
  /** The bound state value, when the node carries bind:state. */
  value?: unknown;
  /** Writes the bound state key; present when bind:state is set. */
  setValue?: (v: unknown) => void;
  /** One ready-to-attach callback per on:event entry, keyed by event name. */
  events: Record<string, () => void>;
};

/** Per-block overrides: the host's own components, keyed by block type. */
export type MosaicComponents = Record<string, React.ComponentType<MosaicBlockProps>>;

/** The rich components this renderer draws natively; the rest decompose. */
const NATIVE_RICH = new Set(['DataTable', 'List', 'Timeline', 'Stat', 'Chart', 'Steps', 'Diagram']);

// --- local state mutations ------------------------------------------------------

const SET_RE = /^state\.set\(\s*['"]([^'"]+)['"]\s*,\s*(.+)\)\s*$/;
const TOGGLE_RE = /^state\.toggle\(\s*['"]([^'"]+)['"]\s*\)\s*$/;

function literal(src: string): PropValue {
  const t = src.trim();
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (t === 'null') return null;
  if (/^-?[0-9.]+$/.test(t)) return Number(t);
  const m = /^['"](.*)['"]$/.exec(t);
  return m ? (m[1] as string) : t;
}

type Dispatch = (action: ActionRef, resolvedArgs?: Record<string, unknown>) => void;

// --- the artifact component ------------------------------------------------------

type ArtifactProps = {
  doc: MosaicDocument;
  manifest: HostManifest;
  theme: Theme;
  onAction?: OnAction;
  components?: MosaicComponents;
};

function MosaicArtifact({
  doc,
  manifest,
  theme,
  onAction,
  components,
}: ArtifactProps): React.ReactElement {
  const [state, setState] = React.useState<StateScope>(() => initialState(doc));

  // The single write choke point: keys are state paths ("eggs",
  // "files[2].checked"), already concrete on resolved nodes. Copy-on-write via
  // writeStatePath keeps initialState's shared references intact.
  const setKey = React.useCallback((key: string, value: unknown) => {
    setState((s) => writeStatePath(s, key, value as ExprValue));
  }, []);

  const dispatch = React.useCallback<Dispatch>(
    (action, resolvedArgs) => {
      if (typeof action === 'string') {
        const set = SET_RE.exec(action);
        if (set) {
          setKey(set[1] as string, literal(set[2] as string));
          return;
        }
        const toggle = TOGGLE_RE.exec(action);
        if (toggle) {
          const path = toggle[1] as string;
          setState((s) => writeStatePath(s, path, !readStatePath(s, path)));
          return;
        }
        void onAction?.(action, resolvedArgs);
        return;
      }
      void onAction?.(action.action, resolvedArgs ?? action.args);
    },
    [onAction, setKey],
  );

  const resolved = resolve(doc, manifest, state);
  const ctx: RenderContext = { manifest, theme, state, setKey, dispatch, components };
  return renderNode(resolved.root, ctx, 'root');
}

type RenderContext = {
  manifest: HostManifest;
  theme: Theme;
  state: StateScope;
  setKey: (key: string, value: unknown) => void;
  dispatch: Dispatch;
  components?: MosaicComponents;
};

// --- styling helpers ---------------------------------------------------------------

function px(v: number | string | undefined): string | undefined {
  if (v === undefined) return undefined;
  return typeof v === 'number' ? `${v}px` : v;
}

function space(theme: Theme, v: PropValue | undefined): string | undefined {
  if (v === undefined || v === null) return undefined;
  const val = theme.space[String(v)];
  return px(val ?? Number(v) * 4);
}

function toneColor(theme: Theme, tone: PropValue | undefined): string | undefined {
  if (typeof tone !== 'string') return undefined;
  if (tone === 'subtle') return theme.color.subtle;
  return theme.tone?.[tone];
}

function surface(theme: Theme): string | undefined {
  return theme.color.surface ?? theme.color.bg;
}

function hairline(theme: Theme): string {
  return theme.color.border ?? theme.color.subtle ?? 'currentColor';
}

/** tone color at low alpha, for tinted chips and callouts */
function tinted(color: string | undefined, alpha: string): string | undefined {
  if (!color) return undefined;
  return `color-mix(in srgb, ${color} ${alpha}, transparent)`;
}

function tokenValue(ctx: RenderContext, v: PropValue): PropValue {
  if (isTokenRef(v)) return (resolveToken(ctx.theme, v.$token) ?? null) as PropValue;
  return v;
}

function str(v: PropValue | undefined): string {
  if (v === undefined || v === null) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function num(v: PropValue | undefined, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

const h = React.createElement;

// --- stateful reference blocks -------------------------------------------------------
// Controls with a bind:state drive artifact state; without one they still work
// on renderer-local state, so a mock stays a live mock.

function useBindable<T>(
  ctx: RenderContext,
  bind: string | undefined,
  fallback: T,
): [T, (v: T) => void] {
  const [local, setLocal] = React.useState<T>(fallback);
  if (bind) {
    // bind is the concrete path the resolver produced ("files[2].checked").
    const bound = readStatePath(ctx.state, bind);
    return [
      bound === undefined || bound === null ? fallback : (bound as T),
      (v: T) => ctx.setKey(bind, v),
    ];
  }
  return [local, setLocal];
}

type BlockProps = {
  node: MosaicNode;
  ctx: RenderContext;
  path: string;
};

function TabsBlock({ node, ctx, path }: BlockProps): React.ReactElement {
  const t = ctx.theme;
  const props = node.props ?? {};
  const labels = Array.isArray(props.items) ? props.items.map((o) => str(o as PropValue)) : [];
  const active = props.active;
  const defaultLabel =
    typeof active === 'number' ? (labels[active] ?? labels[0]) : str(active) || labels[0];
  const bind = node.directives?.['bind:state'];
  const [valueRaw, setValue] = useBindable<string>(ctx, bind, defaultLabel ?? '');
  const value = str(valueRaw);
  const activeIndex = Math.max(labels.indexOf(value), 0);
  const underline = props.variant === 'underline';
  const panel = node.children?.[activeIndex];

  return h(
    'div',
    { style: { display: 'flex', flexDirection: 'column', gap: space(t, '3') } },
    h(
      'div',
      {
        key: 'list',
        role: 'tablist',
        style: underline
          ? { display: 'flex', gap: 16, borderBottom: `1px solid ${hairline(t)}`, minWidth: 0 }
          : {
              display: 'inline-flex',
              flexWrap: 'wrap',
              gap: 2,
              padding: 3,
              borderRadius: px(t.radius.md),
              background: 'rgba(0, 0, 0, 0.25)',
              border: `1px solid ${hairline(t)}`,
              alignSelf: 'flex-start',
            },
      },
      ...labels.map((label, i) => {
        const selected = i === activeIndex;
        return h(
          'button',
          {
            key: label,
            type: 'button',
            role: 'tab',
            'aria-selected': selected,
            onClick: () => setValue(label),
            style: underline
              ? {
                  padding: '0 2px 8px',
                  marginBottom: -1,
                  border: 'none',
                  borderBottom: `2px solid ${selected ? t.color.accent : 'transparent'}`,
                  background: 'transparent',
                  color: selected ? t.color.accent : t.color.subtle,
                  fontSize: 'inherit',
                  lineHeight: 'inherit',
                  fontWeight: 550,
                  fontFamily: t.font.sans,
                  cursor: 'pointer',
                }
              : {
                  padding: '5px 14px',
                  borderRadius: px((t.radius.md ?? 10) - 3),
                  border: 'none',
                  background: selected ? (surface(t) ?? t.color.accent) : 'transparent',
                  color: selected ? t.color.fg : t.color.subtle,
                  fontWeight: selected ? 550 : 450,
                  fontSize: 'inherit',
                  lineHeight: 'inherit',
                  fontFamily: t.font.sans,
                  cursor: 'pointer',
                  boxShadow: selected
                    ? 'inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 1px 2px rgba(0, 0, 0, 0.3)'
                    : 'none',
                },
          },
          label,
        );
      }),
    ),
    panel ? renderNode(panel, ctx, `${path}.panel.${activeIndex}`) : null,
  );
}

function MultiSelectBlock({ node, ctx }: BlockProps): React.ReactElement {
  const t = ctx.theme;
  const props = node.props ?? {};
  const options = Array.isArray(props.options) ? props.options.map((o) => str(o as PropValue)) : [];
  const bind = node.directives?.['bind:state'];
  const initial = Array.isArray(props.value) ? props.value.map((v) => str(v as PropValue)) : [];
  const [rawValue, setValue] = useBindable<unknown>(ctx, bind, initial);
  const selected = Array.isArray(rawValue) ? rawValue.map((v) => str(v as PropValue)) : [];

  const toggle = (option: string) => {
    setValue(
      selected.includes(option) ? selected.filter((s) => s !== option) : [...selected, option],
    );
  };

  return labeled('ms', str(props.label as PropValue), t, [
    h(
      'div',
      {
        key: 'options',
        role: 'listbox',
        'aria-multiselectable': true,
        style: {
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6,
          padding: 8,
          borderRadius: px(t.radius.md),
          border: `1px solid ${hairline(t)}`,
          background: 'rgba(0, 0, 0, 0.25)',
        },
      },
      ...options.map((option) => {
        const on = selected.includes(option);
        return h(
          'button',
          {
            key: option,
            type: 'button',
            role: 'option',
            'aria-selected': on,
            onClick: () => toggle(option),
            style: {
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '3px 10px',
              borderRadius: px(t.radius.sm),
              border: `1px solid ${on ? (tinted(t.color.accent, '45%') ?? t.color.accent) : hairline(t)}`,
              background: on ? tinted(t.color.accent, '14%') : 'transparent',
              color: on ? t.color.fg : t.color.subtle,
              fontSize: '0.85rem',
              lineHeight: 'inherit',
              fontFamily: t.font.sans,
              cursor: 'pointer',
            },
          },
          on ? '✓ ' : '',
          option,
        );
      }),
    ),
  ]);
}

function AutocompleteBlock({ node, ctx }: BlockProps): React.ReactElement {
  const t = ctx.theme;
  const props = node.props ?? {};
  const options = Array.isArray(props.options) ? props.options.map((o) => str(o as PropValue)) : [];
  const bind = node.directives?.['bind:state'];
  const [value, setValue] = useBindable<string>(ctx, bind, str(props.value as PropValue));
  const [open, setOpen] = React.useState(false);
  const query = str(value);
  const matches = options
    .filter((o) => o.toLowerCase().includes(query.toLowerCase()) && o !== query)
    .slice(0, 6);

  return labeled('ac', str(props.label as PropValue), t, [
    h(
      'div',
      { key: 'root', style: { position: 'relative' } },
      h('input', {
        key: 'input',
        type: 'text',
        role: 'combobox',
        'aria-expanded': open && matches.length > 0,
        value: query,
        placeholder: str(props.placeholder as PropValue) || undefined,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
          setValue(e.target.value);
          setOpen(true);
        },
        onFocus: () => setOpen(true),
        onBlur: () => window.setTimeout(() => setOpen(false), 120),
        style: { ...fieldStyle(t), width: '100%', boxSizing: 'border-box' },
      }),
      open && matches.length > 0
        ? h(
            'div',
            {
              key: 'list',
              role: 'listbox',
              style: {
                position: 'absolute',
                top: 'calc(100% + 4px)',
                left: 0,
                right: 0,
                zIndex: 10,
                borderRadius: px(t.radius.md),
                border: `1px solid ${hairline(t)}`,
                background: surface(t),
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 8px 24px rgba(0,0,0,0.5)',
                overflow: 'hidden',
              },
            },
            ...matches.map((option) =>
              h(
                'button',
                {
                  key: option,
                  type: 'button',
                  role: 'option',
                  onMouseDown: (e: React.MouseEvent) => e.preventDefault(),
                  onClick: () => {
                    setValue(option);
                    setOpen(false);
                  },
                  style: {
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '7px 10px',
                    border: 'none',
                    background: 'transparent',
                    color: t.color.fg,
                    fontSize: 'inherit',
                    lineHeight: 'inherit',
                    fontFamily: t.font.sans,
                    cursor: 'pointer',
                  },
                },
                option,
              ),
            ),
          )
        : null,
    ),
  ]);
}

function TagInputBlock({ node, ctx }: BlockProps): React.ReactElement {
  const t = ctx.theme;
  const props = node.props ?? {};
  const bind = node.directives?.['bind:state'];
  const initial = Array.isArray(props.value) ? props.value.map((v) => str(v as PropValue)) : [];
  const [rawValue, setValue] = useBindable<unknown>(ctx, bind, initial);
  const tags = Array.isArray(rawValue) ? rawValue.map((v) => str(v as PropValue)) : [];
  const [draft, setDraft] = React.useState('');

  const commit = () => {
    const tag = draft.trim();
    if (tag && !tags.includes(tag)) setValue([...tags, tag]);
    setDraft('');
  };

  return labeled('ti', str(props.label as PropValue), t, [
    h(
      'div',
      {
        key: 'root',
        style: {
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 6,
          padding: '6px 10px',
          minHeight: 24,
          borderRadius: px(t.radius.md),
          border: `1px solid ${hairline(t)}`,
          background: 'rgba(0, 0, 0, 0.25)',
        },
      },
      ...tags.map((tag) =>
        h(
          'span',
          {
            key: tag,
            style: {
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 8px',
              borderRadius: px(t.radius.sm),
              border: `1px solid ${hairline(t)}`,
              background: tinted(t.color.fg, '8%'),
              color: t.color.fg,
              fontSize: '0.8rem',
              fontWeight: 500,
            },
          },
          tag,
          h(
            'button',
            {
              key: 'x',
              type: 'button',
              'aria-label': `remove ${tag}`,
              onClick: () => setValue(tags.filter((x) => x !== tag)),
              style: {
                border: 'none',
                background: 'transparent',
                color: t.color.subtle,
                cursor: 'pointer',
                padding: 0,
                fontSize: 'inherit',
                lineHeight: 1,
              },
            },
            '×',
          ),
        ),
      ),
      h('input', {
        key: 'input',
        type: 'text',
        value: draft,
        placeholder: tags.length === 0 ? str(props.placeholder as PropValue) || 'Add…' : undefined,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => setDraft(e.target.value),
        onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Backspace' && draft === '' && tags.length > 0) {
            setValue(tags.slice(0, -1));
          }
        },
        onBlur: commit,
        style: {
          flex: 1,
          minWidth: 80,
          border: 'none',
          outline: 'none',
          background: 'transparent',
          color: t.color.fg,
          fontSize: 'inherit',
          lineHeight: 'inherit',
          fontFamily: t.font.sans,
        },
      }),
    ),
  ]);
}

function RatingBlock({ node, ctx }: BlockProps): React.ReactElement {
  const t = ctx.theme;
  const props = node.props ?? {};
  const max = Math.max(num(props.max as PropValue, 5), 1);
  const bind = node.directives?.['bind:state'];
  const [value, setValue] = useBindable<number>(ctx, bind, num(props.value as PropValue));
  const filled = t.tone?.warn ?? t.color.accent;

  return labeled('rt', str(props.label as PropValue), t, [
    h(
      'div',
      { key: 'stars', role: 'radiogroup', style: { display: 'inline-flex', gap: 2 } },
      ...Array.from({ length: max }, (_, i) =>
        h(
          'button',
          {
            key: String(i),
            type: 'button',
            role: 'radio',
            'aria-checked': num(value) === i + 1,
            'aria-label': `${i + 1} of ${max}`,
            onClick: () => setValue(i + 1),
            style: {
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              padding: 0,
              fontSize: '1.15rem',
              lineHeight: 1,
              color: i < num(value) ? filled : (tinted(t.color.fg, '25%') ?? t.color.subtle),
            },
          },
          i < num(value) ? '★' : '☆',
        ),
      ),
    ),
  ]);
}

function SwitchBlock({ node, ctx }: BlockProps): React.ReactElement {
  const t = ctx.theme;
  const props = node.props ?? {};
  const bind = node.directives?.['bind:state'];
  const [value, setValue] = useBindable<unknown>(
    ctx,
    bind,
    props.value === true || props.checked === true,
  );
  const on = Boolean(value);

  return h(
    'label',
    {
      style: {
        display: 'flex',
        gap: 10,
        alignItems: 'center',
        fontFamily: t.font.sans,
        cursor: 'pointer',
      },
    },
    h(
      'button',
      {
        key: 'switch',
        type: 'button',
        role: 'switch',
        'aria-checked': on,
        onClick: () => setValue(!on),
        style: {
          width: 36,
          height: 20,
          flexShrink: 0,
          borderRadius: 9999,
          border: '1px solid transparent',
          background: on ? t.color.accent : (tinted(t.color.fg, '22%') ?? t.color.subtle),
          position: 'relative',
          cursor: 'pointer',
          padding: 0,
          transition: 'background 0.15s ease',
        },
      },
      h('span', {
        key: 'thumb',
        style: {
          position: 'absolute',
          top: 1,
          left: on ? 17 : 1,
          width: 16,
          height: 16,
          borderRadius: 9999,
          background: '#ffffff',
          boxShadow: '0 1px 2px rgba(0,0,0,0.24), 0 0 0 0.5px rgba(0,0,0,0.06)',
          transition: 'left 0.15s ease',
        },
      }),
    ),
    str(props.label as PropValue),
  );
}

// --- the Diagram reference block ------------------------------------------------------
// Declarative nodes/edges/groups drawn as SVG over layoutDiagram()'s geometry
// (docs/proposal.md §4.3). With bind:state, the bound path two-way binds the
// selected node id: clicking a node writes its id, the background writes null,
// and an authored on:event select escalates to the host with { id } merged in.

function asRecords(v: PropValue | undefined): Array<Record<string, PropValue>> {
  if (!Array.isArray(v)) return [];
  return v.filter(
    (item): item is Record<string, PropValue> =>
      item !== null && typeof item === 'object' && !Array.isArray(item),
  );
}

function DiagramBlock({ node, ctx, path }: BlockProps): React.ReactElement {
  const t = ctx.theme;
  const props = node.props ?? {};
  const layout = layoutDiagram({
    direction: props.direction,
    nodes: props.nodes,
    edges: props.edges,
    groups: props.groups,
  });

  const nodeMeta = new Map<string, Record<string, PropValue>>();
  for (const n of asRecords(props.nodes)) {
    const id = str(n.id);
    if (id && !nodeMeta.has(id)) nodeMeta.set(id, n);
  }
  const groupMeta = new Map<string, Record<string, PropValue>>();
  for (const g of asRecords(props.groups)) groupMeta.set(str(g.id), g);
  // layout drops edges with unknown endpoints; mirror its filter so the input
  // metadata (tone, dashed, label) zips 1:1 with layout.edges.
  const anchored = new Set([...layout.nodes, ...layout.groups].map((r) => r.id));
  const edgeMeta = asRecords(props.edges).filter(
    (e) => anchored.has(str(e.from)) && anchored.has(str(e.to)),
  );

  const bind = node.directives?.['bind:state'];
  const selectAction = node.directives?.['on:event']?.select;
  const interactive =
    ctx.manifest.interactive && (bind !== undefined || selectAction !== undefined);
  const selected = bind ? readStatePath(ctx.state, bind) : undefined;
  const pick = (id: string): void => {
    if (bind) ctx.setKey(bind, id);
    if (!selectAction) return;
    if (typeof selectAction === 'object' && selectAction.args) {
      const args: Record<string, unknown> = { id };
      for (const [k, v] of Object.entries(selectAction.args)) {
        if (k !== 'id') args[k] = isExprRef(v) ? undefined : v;
      }
      ctx.dispatch(selectAction, args);
      return;
    }
    ctx.dispatch(selectAction, { id });
  };

  const hulls = layout.groups.map((r) => {
    const meta = groupMeta.get(r.id) ?? {};
    const tone = toneColor(t, meta.tone);
    return h(
      'g',
      { key: `group.${r.id}` },
      h('rect', {
        key: 'hull',
        x: r.x,
        y: r.y,
        width: r.w,
        height: r.h,
        rx: num(t.radius.md, 10),
        fill: tinted(tone ?? t.color.fg, '5%'),
        stroke: tinted(tone ?? t.color.fg, '16%'),
      }),
      h(
        'text',
        {
          key: 'label',
          x: r.x + 10,
          y: r.y + 15,
          fill: tone ?? t.color.subtle,
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: 0.4,
        },
        str(meta.label) || r.id,
      ),
    );
  });

  // One arrowhead marker per distinct edge color, populated while edges render.
  const markerBase = `mosaic-arrow-${path.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  const markerColors: string[] = [];
  const markerId = (color: string): string => {
    let i = markerColors.indexOf(color);
    if (i === -1) i = markerColors.push(color) - 1;
    return `${markerBase}-${i}`;
  };
  const edgeEls = layout.edges.map((edge, i) => {
    const meta = edgeMeta[i] ?? {};
    const color = toneColor(t, meta.tone) ?? t.color.subtle ?? hairline(t);
    const [p0, p1, p2] = edge.points as [
      { x: number; y: number },
      { x: number; y: number },
      { x: number; y: number } | undefined,
    ];
    const d = p2
      ? `M ${p0.x} ${p0.y} Q ${p1.x} ${p1.y} ${p2.x} ${p2.y}`
      : `M ${p0.x} ${p0.y} L ${p1.x} ${p1.y}`;
    const mid = p2
      ? { x: 0.25 * p0.x + 0.5 * p1.x + 0.25 * p2.x, y: 0.25 * p0.y + 0.5 * p1.y + 0.25 * p2.y }
      : { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
    const label = str(meta.label);
    return h(
      'g',
      { key: `edge.${i}` },
      h('path', {
        key: 'line',
        d,
        fill: 'none',
        stroke: color,
        strokeWidth: 1.25,
        strokeDasharray: meta.dashed === true ? '5 4' : undefined,
        markerEnd: `url(#${markerId(color)})`,
        markerStart: meta.bidirectional === true ? `url(#${markerId(color)})` : undefined,
      }),
      label
        ? h(
            'text',
            {
              key: 'label',
              x: mid.x,
              y: mid.y - 5,
              textAnchor: 'middle',
              fill: t.color.subtle,
              fontSize: 10,
            },
            label,
          )
        : null,
    );
  });

  const nodeEls = layout.nodes.map((r) => {
    const meta = nodeMeta.get(r.id) ?? {};
    const tone = toneColor(t, meta.tone);
    const isSelected = selected !== null && selected !== undefined && str(selected) === r.id;
    const sublabel = str(meta.sublabel);
    const badge = str(meta.badge);
    const badgeW = Math.round(badge.length * 6.2 + 12);
    const cx = r.x + r.w / 2;
    return h(
      'g',
      {
        key: `node.${r.id}`,
        'data-node-id': r.id,
        onClick: interactive
          ? (e: React.MouseEvent) => {
              e.stopPropagation();
              pick(r.id);
            }
          : undefined,
        style: interactive ? { cursor: 'pointer' } : undefined,
      },
      h('rect', {
        key: 'box',
        x: r.x,
        y: r.y,
        width: r.w,
        height: r.h,
        rx: num(t.radius.sm, 6),
        fill: tinted(tone, '10%') ?? surface(t) ?? 'transparent',
        stroke: isSelected ? t.color.accent : (tinted(tone, '55%') ?? hairline(t)),
        strokeWidth: isSelected ? 2 : 1,
      }),
      h(
        'text',
        {
          key: 'label',
          x: cx,
          y: r.y + (sublabel ? r.h / 2 - 6 : r.h / 2),
          textAnchor: 'middle',
          dominantBaseline: 'central',
          fill: t.color.fg,
          fontSize: 12.5,
          fontWeight: 550,
          fontFamily: meta.kind === 'code' ? t.font.mono : t.font.sans,
        },
        str(meta.label) || r.id,
      ),
      sublabel
        ? h(
            'text',
            {
              key: 'sublabel',
              x: cx,
              y: r.y + r.h / 2 + 10,
              textAnchor: 'middle',
              dominantBaseline: 'central',
              fill: t.color.subtle,
              fontSize: 10.5,
            },
            sublabel,
          )
        : null,
      badge
        ? h(
            'g',
            { key: 'badge' },
            h('rect', {
              key: 'chip',
              x: r.x + r.w - badgeW - 6,
              y: r.y - 9,
              width: badgeW,
              height: 16,
              rx: 8,
              fill: surface(t) ?? t.color.bg,
              stroke: tinted(tone, '45%') ?? hairline(t),
            }),
            h(
              'text',
              {
                key: 'text',
                x: r.x + r.w - 6 - badgeW / 2,
                y: r.y - 1,
                textAnchor: 'middle',
                fill: tone ?? t.color.subtle,
                fontSize: 9.5,
                fontWeight: 600,
              },
              badge,
            ),
          )
        : null,
    );
  });

  return h(
    'svg',
    {
      role: 'img',
      'aria-label': str(props.alt),
      width: layout.width,
      height: layout.height,
      viewBox: `0 0 ${layout.width} ${layout.height}`,
      style: { display: 'block', maxWidth: '100%', height: 'auto', fontFamily: t.font.sans },
    },
    h(
      'defs',
      { key: 'defs' },
      ...markerColors.map((color, i) =>
        h(
          'marker',
          {
            key: `m.${i}`,
            id: `${markerBase}-${i}`,
            viewBox: '0 0 10 10',
            refX: 9,
            refY: 5,
            markerWidth: 7,
            markerHeight: 7,
            orient: 'auto-start-reverse',
          },
          h('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: color }),
        ),
      ),
    ),
    h('rect', {
      key: 'bg',
      'data-diagram-bg': 'true',
      x: 0,
      y: 0,
      width: layout.width,
      height: layout.height,
      fill: 'transparent',
      onClick: interactive && bind ? () => ctx.setKey(bind, null) : undefined,
    }),
    ...hulls,
    ...edgeEls,
    ...nodeEls,
  );
}

// --- node rendering -----------------------------------------------------------------

function renderChildren(node: MosaicNode, ctx: RenderContext, path: string): React.ReactNode[] {
  return (node.children ?? []).map((child, i) =>
    renderNode(child, ctx, child.directives?.key ? String(child.directives.key) : `${path}.${i}`),
  );
}

function eventHandlers(
  node: MosaicNode,
  ctx: RenderContext,
): Record<string, (() => void) | undefined> {
  const events = node.directives?.['on:event'];
  if (!events) return {};
  const handlers: Record<string, () => void> = {};
  for (const [event, action] of Object.entries(events)) {
    const key = `on${event.charAt(0).toUpperCase()}${event.slice(1)}`;
    handlers[key] = () => {
      if (typeof action === 'object' && action.args) {
        // args were resolved against state during resolve(); they are plain values here
        const args: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(action.args)) {
          args[k] = isExprRef(v) ? undefined : v;
        }
        ctx.dispatch(action, args);
        return;
      }
      ctx.dispatch(action);
    };
  }
  return handlers;
}

function renderNode(node: MosaicNode, ctx: RenderContext, key: string): React.ReactElement {
  if (node.type === TEXT_TYPE) {
    return h(React.Fragment, { key }, str(node.props?.value));
  }

  // The host's own component wins over everything, including decomposeTo:
  // a host that registered a block knows how to draw it.
  const Custom = ctx.components?.[node.type];
  if (Custom) {
    const bind = node.directives?.['bind:state'];
    const resolvedProps: Record<string, PropValue> = {};
    for (const [k, v] of Object.entries(node.props ?? {})) resolvedProps[k] = tokenValue(ctx, v);
    const events: Record<string, () => void> = {};
    for (const [event, action] of Object.entries(node.directives?.['on:event'] ?? {})) {
      events[event] = () => {
        if (typeof action === 'object' && action.args) {
          const args: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(action.args)) {
            args[k] = isExprRef(v) ? undefined : v;
          }
          ctx.dispatch(action, args);
          return;
        }
        ctx.dispatch(action);
      };
    }
    return h(Custom, {
      key,
      node,
      props: resolvedProps,
      children: renderChildren(node, ctx, key),
      value: bind ? readStatePath(ctx.state, bind) : undefined,
      setValue: bind ? (v: unknown) => ctx.setKey(bind, v) : undefined,
      events,
    });
  }

  const spec = blockSpec(node.type);
  const supported =
    NATIVE_RICH.has(node.type) && ctx.manifest.components_supported.includes(node.type);
  if (spec?.rich && spec.decomposeTo && !supported) {
    return renderNode(spec.decomposeTo(node), ctx, key);
  }
  if (!spec) {
    // unknown tag: the debug Box (strict hosts fail in validate() instead)
    return h(
      'div',
      { key, style: { border: '1px dashed currentColor', padding: 8, opacity: 0.6 } },
      `<${node.type}>`,
      ...renderChildren(node, ctx, key),
    );
  }

  const t = ctx.theme;
  const props = node.props ?? {};
  const get = (name: string): PropValue => tokenValue(ctx, props[name] ?? null);
  const children = () => renderChildren(node, ctx, key);
  const handlers = eventHandlers(node, ctx);
  const bind = node.directives?.['bind:state'];
  const bound = bind ? (readStatePath(ctx.state, bind) ?? undefined) : undefined;

  switch (node.type) {
    // --- layout
    case 'Box':
      return h(
        'div',
        { key, style: { padding: space(t, get('pad')) }, ...handlers },
        ...children(),
      );
    case 'Stack': {
      const horizontal = get('direction') === 'horizontal';
      return h(
        'div',
        {
          key,
          style: {
            display: 'flex',
            flexDirection: horizontal ? 'row' : 'column',
            alignItems: horizontal ? 'center' : undefined,
            gap: space(t, get('gap')),
          },
        },
        ...children(),
      );
    }
    case 'Grid': {
      // `cols` is the design grid; children without explicit spans divide it
      // equally, so a 12-col Grid with two Cards renders two real columns.
      const count = Math.max(node.children?.length ?? 1, 1);
      const cols = num(get('cols'), 12);
      const tracks = count <= cols ? count : cols;
      return h(
        'div',
        {
          key,
          style: {
            display: 'grid',
            gridTemplateColumns: `repeat(${tracks}, minmax(0, 1fr))`,
            gap: space(t, get('gap')),
            alignItems: 'stretch',
          },
        },
        ...children(),
      );
    }
    case 'Divider':
      return h('hr', {
        key,
        style: { border: 'none', borderTop: `1px solid ${hairline(t)}`, margin: 0, width: '100%' },
      });
    case 'Card':
      return h(
        'section',
        {
          key,
          style: {
            display: 'flex',
            flexDirection: 'column',
            gap: space(t, get('gap')),
            padding: space(t, get('pad') ?? '4'),
            borderRadius: px(t.radius.lg),
            border: `1px solid ${hairline(t)}`,
            background: surface(t),
            color: t.color.fg,
            boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.04)',
            minWidth: 0,
          },
          ...handlers,
        },
        ...children(),
      );

    // --- content
    case 'Text': {
      const tone = toneColor(t, get('tone'));
      return h(
        'p',
        {
          key,
          style: {
            margin: 0,
            color: tone,
            fontWeight: get('weight') === 'bold' ? 600 : undefined,
            fontSize: get('size') === 'xl' ? '1.25rem' : undefined,
            fontFamily: t.font.sans,
          },
        },
        ...children(),
      );
    }
    case 'Heading': {
      const level = Math.min(Math.max(num(get('level'), 2), 1), 6);
      return h(
        `h${level}`,
        {
          key,
          style: {
            margin: 0,
            fontFamily: t.font.sans,
            color: t.color.fg,
            fontWeight: 650,
            lineHeight: 1.12,
            letterSpacing: 0,
            textWrap: 'balance',
          },
        },
        ...children(),
      );
    }
    case 'Markdown':
    case 'Code':
      return h(
        'pre',
        {
          key,
          style: {
            margin: 0,
            fontFamily: t.font.mono,
            whiteSpace: 'pre-wrap',
          },
        },
        str(get('value')) || undefined,
        ...children(),
      );
    case 'Image':
      return h('img', {
        key,
        src: str(get('src')),
        alt: str(get('alt')),
        style: { maxWidth: '100%' },
      });
    case 'Icon':
      return h('span', { key, 'aria-hidden': true }, str(get('name')));
    case 'Link':
      return h(
        'a',
        { key, href: str(get('href')), style: { color: t.color.accent } },
        ...(node.children?.length ? children() : [str(get('href'))]),
      );
    case 'Badge':
    case 'Tag': {
      const tone = toneColor(t, get('tone'));
      return h(
        'span',
        {
          key,
          style: {
            display: 'inline-block',
            padding: '2px 10px',
            borderRadius: px(t.radius.full),
            border: `1px solid ${tinted(tone, '32%') ?? hairline(t)}`,
            background: tinted(tone, '12%'),
            color: tone ?? t.color.subtle,
            fontSize: '0.8em',
            fontWeight: 500,
            fontFamily: t.font.sans,
            whiteSpace: 'nowrap',
          },
        },
        ...children(),
      );
    }
    case 'Avatar':
      return h(
        'span',
        {
          key,
          style: {
            display: 'inline-flex',
            width: 32,
            height: 32,
            borderRadius: px(t.radius.full),
            background: t.color.subtle,
            alignItems: 'center',
            justifyContent: 'center',
          },
        },
        str(get('initials') || get('name')).slice(0, 2),
      );
    case 'Callout': {
      const tone = toneColor(t, get('tone')) ?? t.color.accent;
      return h(
        'aside',
        {
          key,
          style: {
            padding: `${space(t, '3')} ${space(t, '4')}`,
            borderRadius: px(t.radius.md),
            borderLeft: `3px solid ${tone}`,
            background: tinted(tone, '8%'),
            color: t.color.fg,
            display: 'flex',
            flexDirection: 'column',
            gap: space(t, '1'),
          },
        },
        ...children(),
      );
    }

    // --- controls
    case 'Button': {
      const primary = get('tone') === 'primary';
      return h(
        'button',
        {
          key,
          type: 'button',
          style: {
            alignSelf: 'flex-start',
            padding: '8px 18px',
            borderRadius: px(t.radius.md),
            border: primary ? '1px solid transparent' : `1px solid ${hairline(t)}`,
            cursor: 'pointer',
            fontSize: 'inherit',
            lineHeight: 'inherit',
            fontFamily: t.font.sans,
            fontWeight: 550,
            background: primary ? t.color.accent : (surface(t) ?? 'transparent'),
            color: primary ? '#ffffff' : t.color.fg,
            boxShadow: primary ? 'none' : 'inset 0 1px 0 rgba(255, 255, 255, 0.04)',
          },
          ...handlers,
        },
        ...children(),
      );
    }
    case 'Slider':
      return labeled(key, str(get('label')), t, [
        h('input', {
          key: `${key}.input`,
          type: 'range',
          min: num(get('min')),
          max: num(get('max'), 100),
          step: num(get('step'), 1),
          value: num(bound ?? get('value')),
          onChange: bind
            ? (e: React.ChangeEvent<HTMLInputElement>) => ctx.setKey(bind, Number(e.target.value))
            : undefined,
          readOnly: !bind,
          style: { width: '100%', accentColor: t.color.accent, margin: 0 },
        }),
      ]);
    case 'Toggle':
      return h(SwitchBlock, { key, node, ctx, path: key });
    case 'Tabs':
      return h(TabsBlock, { key, node, ctx, path: key });
    case 'MultiSelect':
      return h(MultiSelectBlock, { key, node, ctx, path: key });
    case 'Autocomplete':
      return h(AutocompleteBlock, { key, node, ctx, path: key });
    case 'TagInput':
      return h(TagInputBlock, { key, node, ctx, path: key });
    case 'Rating':
      return h(RatingBlock, { key, node, ctx, path: key });
    case 'DatePicker':
      return labeled(key, str(get('label')), t, [
        h('input', {
          key: `${key}.input`,
          type: 'date',
          value: str(bound ?? get('value')),
          onChange: bind
            ? (e: React.ChangeEvent<HTMLInputElement>) => ctx.setKey(bind, e.target.value)
            : undefined,
          readOnly: !bind,
          style: { ...fieldStyle(t), colorScheme: 'dark' },
        }),
      ]);
    case 'ColorPicker':
      return labeled(key, str(get('label')), t, [
        h(
          'div',
          { key: `${key}.row`, style: { display: 'flex', gap: 8, alignItems: 'center' } },
          h('input', {
            key: `${key}.input`,
            type: 'color',
            value: str(bound ?? get('value')) || '#7c7cff',
            onChange: bind
              ? (e: React.ChangeEvent<HTMLInputElement>) => ctx.setKey(bind, e.target.value)
              : undefined,
            style: {
              width: 36,
              height: 28,
              padding: 2,
              borderRadius: px(t.radius.sm),
              border: `1px solid ${hairline(t)}`,
              background: 'transparent',
              cursor: 'pointer',
            },
          }),
          h(
            'code',
            { key: `${key}.value`, style: { fontFamily: t.font.mono, fontSize: '0.8rem' } },
            str(bound ?? get('value')),
          ),
        ),
      ]);
    case 'FilePicker':
      return labeled(key, str(get('label')), t, [
        h('input', { key: `${key}.input`, type: 'file', style: fieldStyle(t) }),
      ]);
    case 'Radio': {
      const options = Array.isArray(props.options) ? props.options : [];
      return labeled(key, str(get('label')), t, [
        h(
          'div',
          {
            key: `${key}.group`,
            role: 'radiogroup',
            style: { display: 'flex', flexDirection: 'column', gap: 6 },
          },
          ...options.map((o, i) =>
            h(
              'label',
              {
                key: `${key}.${i}`,
                style: { display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' },
              },
              h('input', {
                key: `${key}.${i}.input`,
                type: 'radio',
                checked: str(o) === str(bound ?? get('value')),
                onChange: bind ? () => ctx.setKey(bind, str(o)) : undefined,
                style: { accentColor: t.color.accent, margin: 0 },
              }),
              str(o),
            ),
          ),
        ),
      ]);
    }
    case 'Checkbox':
      return h(
        'label',
        { key, style: { display: 'flex', gap: 8, alignItems: 'center', fontFamily: t.font.sans } },
        h('input', {
          key: `${key}.input`,
          type: 'checkbox',
          checked: Boolean(bound ?? get('checked')),
          onChange: bind
            ? (e: React.ChangeEvent<HTMLInputElement>) => ctx.setKey(bind, e.target.checked)
            : undefined,
          readOnly: !bind,
          style: { accentColor: t.color.accent, width: 15, height: 15, margin: 0 },
        }),
        str(get('label')),
        ...children(),
      );
    case 'Input':
      return labeled(key, str(get('label')), t, [
        h('input', {
          key: `${key}.input`,
          type: str(get('type')) || 'text',
          value: str(bound ?? get('value')),
          placeholder: str(get('placeholder')) || undefined,
          onChange: bind
            ? (e: React.ChangeEvent<HTMLInputElement>) => ctx.setKey(bind, e.target.value)
            : undefined,
          readOnly: !bind,
          style: fieldStyle(t),
        }),
      ]);
    case 'Select': {
      const options = Array.isArray(props.options) ? props.options : [];
      return h(
        'select',
        {
          key,
          value: str(bound ?? get('value')),
          onChange: bind
            ? (e: React.ChangeEvent<HTMLSelectElement>) => ctx.setKey(bind, e.target.value)
            : undefined,
          style: { ...fieldStyle(t), cursor: 'pointer' },
        },
        ...options.map((o, i) => h('option', { key: `${key}.${i}`, value: str(o) }, str(o))),
      );
    }
    case 'SegmentedControl': {
      const options = Array.isArray(props.options) ? props.options : [];
      return h(
        'div',
        {
          key,
          role: 'group',
          style: {
            display: 'inline-flex',
            flexWrap: 'wrap',
            gap: 2,
            padding: 3,
            borderRadius: px(t.radius.md),
            background: 'rgba(0, 0, 0, 0.25)',
            border: `1px solid ${hairline(t)}`,
            alignSelf: 'flex-start',
          },
        },
        ...options.map((o, i) => {
          const selected = str(o) === str(bound);
          return h(
            'button',
            {
              key: `${key}.${i}`,
              type: 'button',
              'aria-pressed': selected,
              onClick: bind ? () => ctx.setKey(bind, str(o)) : undefined,
              style: {
                padding: '5px 14px',
                borderRadius: px((t.radius.md ?? 10) - 3),
                border: 'none',
                background: selected ? (surface(t) ?? t.color.accent) : 'transparent',
                color: selected ? t.color.fg : t.color.subtle,
                fontWeight: selected ? 550 : 450,
                fontSize: 'inherit',
                lineHeight: 'inherit',
                fontFamily: t.font.sans,
                cursor: 'pointer',
                boxShadow: selected
                  ? 'inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 1px 2px rgba(0, 0, 0, 0.3)'
                  : 'none',
              },
            },
            str(o),
          );
        }),
      );
    }
    case 'Field':
      return labeled(key, str(get('label')), t, children());
    case 'Disclosure':
    case 'Accordion':
      return h(
        'details',
        { key },
        h('summary', { key: `${key}.summary` }, str(get('label') || get('title'))),
        ...children(),
      );

    // --- structure & status
    case 'Steps': {
      const items = Array.isArray(props.items) ? props.items : [];
      const current = num(get('current'), -1);
      return h(
        'ol',
        { key, style: { display: 'flex', gap: 12, listStyle: 'none', margin: 0, padding: 0 } },
        ...items.map((item, i) =>
          h(
            'li',
            {
              key: `${key}.${i}`,
              style: {
                fontFamily: t.font.sans,
                fontWeight: i === current ? 600 : 400,
                color: i <= current ? t.color.fg : t.color.subtle,
              },
            },
            `${i + 1}. ${str(item)}`,
          ),
        ),
      );
    }
    case 'Progress': {
      const value = Math.min(Math.max(num(get('value')), 0), 100);
      return h(
        'div',
        {
          key,
          style: { fontFamily: t.font.sans, display: 'flex', flexDirection: 'column', gap: 6 },
        },
        get('label')
          ? h(
              'div',
              { key: `${key}.label`, style: { color: t.color.subtle, fontSize: '0.85rem' } },
              str(get('label')),
            )
          : null,
        h(
          'div',
          {
            key: `${key}.track`,
            role: 'progressbar',
            'aria-valuenow': value,
            style: {
              height: 6,
              borderRadius: px(t.radius.full),
              background: tinted(t.color.fg, '10%') ?? t.color.subtle,
              overflow: 'hidden',
            },
          },
          h('div', {
            key: `${key}.bar`,
            style: { width: `${value}%`, height: '100%', background: t.color.accent },
          }),
        ),
      );
    }
    case 'Empty': {
      const label = str(get('label'));
      const inner = children();
      return h(
        'div',
        {
          key,
          style: {
            textAlign: 'center',
            color: t.color.subtle,
            padding: 24,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            alignItems: 'center',
          },
        },
        label || (inner.length === 0 ? 'Nothing here yet.' : null),
        ...inner,
      );
    }

    // --- data & viz (native here)
    case 'DataTable': {
      const columns = Array.isArray(props.columns) ? props.columns : [];
      const rows = Array.isArray(props.rows) ? props.rows : [];
      return h(
        'table',
        { key, style: { borderCollapse: 'collapse', fontFamily: t.font.sans, width: '100%' } },
        h(
          'thead',
          { key: `${key}.head` },
          h(
            'tr',
            { key: `${key}.head.row` },
            ...columns.map((c, i) =>
              h(
                'th',
                {
                  key: `${key}.h${i}`,
                  style: {
                    textAlign: 'left',
                    borderBottom: `1px solid ${hairline(t)}`,
                    color: t.color.subtle,
                    fontWeight: 550,
                    fontSize: '0.85rem',
                    padding: '4px 8px',
                  },
                },
                str(c),
              ),
            ),
          ),
        ),
        h(
          'tbody',
          { key: `${key}.body` },
          ...rows.map((row, ri) =>
            h(
              'tr',
              { key: `${key}.r${ri}` },
              ...(Array.isArray(row) ? row : [row]).map((cell, ci) =>
                h(
                  'td',
                  {
                    key: `${key}.r${ri}c${ci}`,
                    style: {
                      padding: '6px 8px',
                      borderBottom: `1px solid ${tinted(hairline(t), '50%') ?? hairline(t)}`,
                    },
                  },
                  str(cell),
                ),
              ),
            ),
          ),
        ),
      );
    }
    case 'List':
      return h(
        'div',
        {
          key,
          style: { display: 'flex', flexDirection: 'column', gap: space(t, get('gap') ?? '2') },
        },
        ...children(),
      );
    case 'Timeline': {
      const items = Array.isArray(props.items) ? props.items : [];
      return h(
        'ol',
        { key, style: { listStyle: 'none', margin: 0, padding: 0, fontFamily: t.font.sans } },
        ...items.map((item, i) => {
          const entry =
            item !== null && typeof item === 'object' && !Array.isArray(item) ? item : {};
          const e = entry as Record<string, PropValue>;
          const tone = toneColor(t, e.tone);
          const description = str(e.description);
          return h(
            'li',
            { key: `${key}.${i}`, style: { display: 'flex', gap: 8, padding: '2px 0' } },
            h('span', { key: `${key}.${i}.dot`, style: { color: tone ?? t.color.subtle } }, '●'),
            h(
              'div',
              {
                key: `${key}.${i}.body`,
                style: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 },
              },
              h(
                'div',
                { key: `${key}.${i}.head`, style: { display: 'flex', gap: 8 } },
                h(
                  'span',
                  { key: `${key}.${i}.date`, style: { color: t.color.subtle } },
                  str(e.date),
                ),
                h('span', { key: `${key}.${i}.title` }, str(e.title)),
              ),
              description
                ? h(
                    'div',
                    {
                      key: `${key}.${i}.description`,
                      style: { color: t.color.subtle, fontSize: '0.85rem' },
                    },
                    description,
                  )
                : null,
            ),
          );
        }),
      );
    }
    case 'Stat':
      return h(
        'div',
        {
          key,
          style: {
            fontFamily: t.font.sans,
            color: toneColor(t, get('tone')) ?? t.color.fg,
            minWidth: 0,
          },
        },
        h(
          'div',
          {
            key: `${key}.value`,
            style: { fontSize: '1.4rem', fontWeight: 650, lineHeight: 1.2, whiteSpace: 'nowrap' },
          },
          str(get('value')),
        ),
        h(
          'div',
          { key: `${key}.label`, style: { color: t.color.subtle, fontSize: '0.85rem' } },
          str(get('label')),
        ),
      );
    case 'Diagram':
      return h(DiagramBlock, { key, node, ctx, path: key });
    case 'Chart': {
      // The reference renderer draws bar charts; everything else falls to alt.
      const series = Array.isArray(props.series) ? props.series : [];
      const first = series[0];
      const points =
        first !== null && typeof first === 'object' && !Array.isArray(first)
          ? ((first as Record<string, PropValue>).points as PropValue[] | undefined)
          : undefined;
      if (get('type') !== 'bar' || !Array.isArray(points)) {
        return h('p', { key, style: { color: t.color.subtle } }, str(get('alt')));
      }
      const values = points.map((p) => (Array.isArray(p) ? num(p[1]) : num(p)));
      const max = Math.max(...values, 1);
      return h(
        'div',
        {
          key,
          role: 'img',
          'aria-label': str(get('alt')),
          style: { display: 'flex', gap: 12, alignItems: 'flex-end', fontFamily: t.font.sans },
        },
        ...points.map((p, i) => {
          const label = Array.isArray(p) ? str(p[0]) : String(i);
          const value = values[i] ?? 0;
          return h(
            'div',
            {
              key: `${key}.${i}`,
              style: {
                textAlign: 'center',
                flex: 1,
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                justifyContent: 'flex-end',
              },
            },
            h(
              'div',
              {
                key: `${key}.${i}.value`,
                style: { fontSize: '0.75rem', color: t.color.subtle, whiteSpace: 'nowrap' },
              },
              Number.isInteger(value) ? String(value) : value.toFixed(2),
            ),
            h('div', {
              key: `${key}.${i}.bar`,
              style: {
                height: `${Math.max(Math.round((value / max) * 120), 2)}px`,
                background: `linear-gradient(to top, ${t.color.accent}, ${tinted(t.color.accent, '72%') ?? t.color.accent})`,
                borderRadius: `${px(t.radius.sm)} ${px(t.radius.sm)} 2px 2px`,
              },
            }),
            h(
              'div',
              {
                key: `${key}.${i}.label`,
                style: {
                  fontSize: '0.75rem',
                  color: t.color.subtle,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                },
              },
              label,
            ),
          );
        }),
      );
    }

    default: {
      // registry blocks without a bespoke reference implementation render as a
      // plain container so their content still shows
      return h('div', { key, ...handlers }, ...children());
    }
  }
}

function labeled(
  key: string,
  label: string,
  t: Theme,
  inner: React.ReactNode[],
): React.ReactElement {
  return h(
    'label',
    { key, style: { display: 'flex', flexDirection: 'column', gap: 6, fontFamily: t.font.sans } },
    label
      ? h(
          'span',
          { key: `${key}.label`, style: { color: t.color.subtle, fontSize: '0.85rem' } },
          label,
        )
      : null,
    ...inner,
  );
}

function fieldStyle(t: Theme): React.CSSProperties {
  return {
    padding: '7px 10px',
    borderRadius: px(t.radius.md),
    border: `1px solid ${hairline(t)}`,
    background: 'rgba(0, 0, 0, 0.25)',
    color: t.color.fg,
    fontSize: 'inherit',
    lineHeight: 'inherit',
    fontFamily: t.font.sans,
    outline: 'none',
    minWidth: 0,
  };
}

// --- the public API ------------------------------------------------------------------

/** Render a Mosaic artifact to a React element. source is inline mosaic-jsx /
 *  mosaic-json or an already-parsed document. */
export function render(source: string | MosaicDocument, opts?: RenderOptions): MosaicElement {
  const manifest: HostManifest = {
    ...(opts?.manifest ?? DEFAULT_MANIFEST),
    ...(opts?.strict !== undefined ? { strict: opts.strict } : {}),
  };
  const theme = opts?.theme ?? DEFAULT_THEME;

  let doc: MosaicDocument;
  if (typeof source === 'string') {
    const result = parse(source, opts?.format ? { format: opts.format } : undefined);
    if (!result.ok) throw new JsxError(result.errors);
    doc = result.doc;
  } else {
    doc = source;
  }

  const checked = validate(doc, manifest);
  if (!checked.ok) {
    throw new Error(
      `mosaic: invalid artifact:\n${checked.errors
        .map((e) => `  ${e.path} <${e.type}> ${e.code}${e.prop ? ` (${e.prop})` : ''}`)
        .join('\n')}`,
    );
  }

  return h(MosaicArtifact, {
    doc,
    manifest,
    theme,
    onAction: opts?.onAction,
    components: opts?.components,
  });
}

/** The component form of render(), for JSX call sites. */
export function Mosaic(props: { source: string | MosaicDocument } & RenderOptions): MosaicElement {
  const { source, ...opts } = props;
  return render(source, opts);
}
