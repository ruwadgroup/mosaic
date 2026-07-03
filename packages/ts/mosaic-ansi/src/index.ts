// @mosaic/ansi - the text/degraded renderer: the decomposeTo floor.
//
// Every artifact renders to readable text: rich components decompose to
// primitives, controls print their default state, and if the terminal offers
// color the tones use it. See docs/proposal.md §7.2.

import {
  DEFAULT_MANIFEST,
  type HostManifest,
  JsxError,
  type MosaicDocument,
  type MosaicNode,
  type PropValue,
  TEXT_TYPE,
  blockSpec,
  initialState,
  parse,
  resolve,
  validate,
} from '@mosaic/core';

export type AnsiOptions = {
  manifest?: HostManifest;
  /** Emit ANSI escape codes. Off by default so output is safe to pipe. */
  color?: boolean;
  /** Line width for dividers. */
  width?: number;
};

const RESET = '\u001b[0m';
const BOLD = '\u001b[1m';
const DIM = '\u001b[2m';
const TONE_CODES: Record<string, string> = {
  ok: '\u001b[32m',
  warn: '\u001b[33m',
  bad: '\u001b[31m',
  subtle: DIM,
};

/** The text renderer draws nothing rich natively - everything decomposes. */
const TEXT_MANIFEST: HostManifest = {
  ...DEFAULT_MANIFEST,
  interactive: false,
  components_supported: ['DataTable', 'Timeline', 'Stat', 'List', 'Steps', 'Progress'],
};

type Ctx = {
  color: boolean;
  width: number;
  indent: number;
};

function str(v: PropValue | undefined): string {
  if (v === undefined || v === null) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function num(v: PropValue | undefined, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function paint(ctx: Ctx, text: string, ...codes: string[]): string {
  if (!ctx.color || codes.length === 0 || text.length === 0) return text;
  return `${codes.join('')}${text}${RESET}`;
}

function toneCode(tone: PropValue | undefined): string | undefined {
  return typeof tone === 'string' ? TONE_CODES[tone] : undefined;
}

function lines(node: MosaicNode, ctx: Ctx): string[] {
  if (node.type === TEXT_TYPE) {
    return [str(node.props?.value)];
  }

  const spec = blockSpec(node.type);
  if (spec?.rich && spec.decomposeTo && !TEXT_MANIFEST.components_supported.includes(node.type)) {
    return lines(spec.decomposeTo(node), ctx);
  }

  const props = node.props ?? {};
  const tone = toneCode(props.tone);
  const kids = (indent = 0): string[] => {
    const inner = { ...ctx, indent: ctx.indent + indent };
    return (node.children ?? []).flatMap((c) => lines(c, inner));
  };
  const inline = (): string => kids().join(' ');

  switch (node.type) {
    case 'Heading': {
      const text = inline();
      const level = num(props.level, 1);
      const underline = level <= 1 ? '='.repeat(Math.min(text.length, ctx.width)) : '';
      const head = paint(ctx, text, BOLD);
      return underline ? [head, underline] : [head];
    }
    case 'Text': {
      const codes: string[] = [];
      if (props.weight === 'bold') codes.push(BOLD);
      const c = tone ?? (props.tone === 'subtle' ? DIM : undefined);
      if (c) codes.push(c);
      return [paint(ctx, inline(), ...codes)];
    }
    case 'Badge':
    case 'Tag':
      return [paint(ctx, `[${inline()}]`, ...(tone ? [tone] : []))];
    case 'Callout':
      return kids().map((l) => paint(ctx, `▎ ${l}`, ...(tone ? [tone] : [])));
    case 'Divider':
      return ['─'.repeat(ctx.width)];
    case 'Card': {
      const inner = kids();
      return inner.map((l) => `│ ${l}`);
    }
    case 'Stack': {
      if (props.direction === 'horizontal') return [kids().join('  ')];
      const gap = num(props.gap, 0) >= 3 ? [''] : [];
      const inner = (node.children ?? []).flatMap((c, i) => {
        const block = lines(c, ctx);
        return i === 0 ? block : [...gap, ...block];
      });
      return inner;
    }
    case 'Grid':
      return kids();
    case 'Box':
      return kids();
    case 'Button':
      return [paint(ctx, `[ ${inline()} ]`, BOLD)];
    case 'Link':
      return [`${inline()} <${str(props.href)}>`];
    case 'Field': {
      const label = str(props.label);
      const inner = kids();
      return label ? [paint(ctx, label, DIM), ...inner] : inner;
    }
    case 'Slider':
      return [`${str(props.label) || 'value'}: ${str(props.value ?? props.min)}`];
    case 'Toggle':
    case 'Checkbox':
      return [
        `(${props.value === true || props.checked === true ? 'x' : ' '}) ${str(props.label)}`,
      ];
    case 'Input':
      return [`${str(props.label) || str(props.placeholder)}: ${str(props.value)}`];
    case 'Select':
    case 'SegmentedControl':
    case 'Autocomplete': {
      const options = Array.isArray(props.options) ? props.options.map((o) => str(o)) : [];
      const value = str(props.value) || str(options[0] ?? '');
      return [`${value} (${options.join(' / ')})`];
    }
    case 'MultiSelect': {
      const selected = Array.isArray(props.value) ? props.value.map((v) => str(v)) : [];
      const options = Array.isArray(props.options) ? props.options.map((o) => str(o)) : [];
      const label = str(props.label);
      const line = options.map((o) => (selected.includes(o) ? `[x] ${o}` : `[ ] ${o}`)).join('  ');
      return label ? [paint(ctx, label, DIM), line] : [line];
    }
    case 'TagInput': {
      const tags = Array.isArray(props.value) ? props.value.map((v) => str(v)) : [];
      return [`${str(props.label) || 'tags'}: ${tags.map((x) => `[${x}]`).join(' ')}`];
    }
    case 'Rating': {
      const max = Math.max(num(props.max, 5), 1);
      const value = Math.min(Math.max(num(props.value), 0), max);
      return [`${'★'.repeat(value)}${'☆'.repeat(max - value)}`];
    }
    case 'DatePicker':
    case 'ColorPicker':
      return [`${str(props.label) || node.type}: ${str(props.value)}`];
    case 'Tabs': {
      const items = Array.isArray(props.items) ? props.items.map((o) => str(o)) : [];
      const active = props.active;
      const activeLabel =
        typeof active === 'number' ? (items[active] ?? items[0]) : str(active) || items[0];
      const activeIndex = Math.max(items.indexOf(activeLabel ?? ''), 0);
      const bar = items
        .map((label, i) => (i === activeIndex ? paint(ctx, `[${label}]`, BOLD) : ` ${label} `))
        .join(' ');
      const panel = node.children?.[activeIndex];
      return panel ? [bar, '', ...lines(panel, ctx)] : [bar];
    }
    case 'Steps': {
      const items = Array.isArray(props.items) ? props.items : [];
      const current = num(props.current, -1);
      return [
        items
          .map((item, i) => {
            const label = `${i + 1}. ${str(item)}`;
            return i === current ? paint(ctx, label, BOLD) : label;
          })
          .join('  →  '),
      ];
    }
    case 'Progress': {
      const value = Math.min(Math.max(num(props.value), 0), 100);
      const cells = Math.round((value / 100) * 20);
      const bar = `[${'█'.repeat(cells)}${'░'.repeat(20 - cells)}] ${Math.round(value)}%`;
      const label = str(props.label);
      return label ? [label, bar] : [bar];
    }
    case 'Stat':
      return [`${paint(ctx, str(props.value), BOLD)}  ${paint(ctx, str(props.label), DIM)}`];
    case 'DataTable': {
      const columns = Array.isArray(props.columns) ? props.columns.map((c) => str(c)) : [];
      const rows = Array.isArray(props.rows)
        ? props.rows.map((r) => (Array.isArray(r) ? r.map((c) => str(c)) : [str(r)]))
        : [];
      const widths = columns.map((c, i) =>
        Math.max(c.length, ...rows.map((r) => (r[i] ?? '').length)),
      );
      const line = (cells: string[]) =>
        cells.map((c, i) => c.padEnd(widths[i] ?? c.length)).join('  ');
      const out: string[] = [];
      if (columns.length > 0) {
        out.push(paint(ctx, line(columns), BOLD));
        out.push(paint(ctx, widths.map((w) => '─'.repeat(w)).join('  '), DIM));
      }
      for (const row of rows) out.push(line(row));
      return out;
    }
    case 'Timeline': {
      const items = Array.isArray(props.items) ? props.items : [];
      return items.flatMap((item) => {
        const e = (
          item !== null && typeof item === 'object' && !Array.isArray(item) ? item : {}
        ) as Record<string, PropValue>;
        const dot = paint(ctx, '●', ...(toneCode(e.tone) ? [toneCode(e.tone) as string] : []));
        const head = `${dot} ${paint(ctx, str(e.date), DIM)}  ${str(e.title)}`;
        const description = str(e.description);
        return description ? [head, `  ${description}`] : [head];
      });
    }
    case 'List':
      return (node.children ?? []).flatMap((c) => {
        const block = lines(c, ctx);
        return block.map((l, i) => (i === 0 ? `• ${l}` : `  ${l}`));
      });
    case 'Empty':
      return [paint(ctx, str(props.label) || 'Nothing here yet.', DIM)];
    default:
      return kids();
  }
}

/** Render a Mosaic artifact to text. Accepts mosaic-jsx, mosaic-json, a fenced
 *  .mosaic file, or a parsed document. */
export function renderAnsi(source: string | MosaicDocument, opts?: AnsiOptions): string {
  let doc: MosaicDocument;
  if (typeof source === 'string') {
    const result = parse(source);
    if (!result.ok) throw new JsxError(result.errors);
    doc = result.doc;
  } else {
    doc = source;
  }

  const manifest = { ...TEXT_MANIFEST, ...(opts?.manifest ?? {}), interactive: false };
  const checked = validate(doc, manifest);
  if (!checked.ok) {
    throw new Error(
      `mosaic: invalid artifact:\n${checked.errors
        .map((e) => `  ${e.path} <${e.type}> ${e.code}${e.prop ? ` (${e.prop})` : ''}`)
        .join('\n')}`,
    );
  }

  // A text surface still evaluates expr: the derived values are part of the
  // content. Interactivity (state changes) is what a static surface lacks.
  const resolved = resolve(doc, { ...manifest, interactive: true }, initialState(doc));
  const ctx: Ctx = { color: opts?.color ?? false, width: opts?.width ?? 60, indent: 0 };
  return `${lines(resolved.root, ctx).join('\n')}\n`;
}
