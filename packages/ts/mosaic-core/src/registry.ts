// The block registry: the §4.1 catalog. General building blocks only, no
// domain templates. Rich components carry a decomposeTo recipe so a renderer
// that cannot draw them renders the primitive expansion instead (invariant 8).

import { type MosaicNode, type PropValue, textNode } from './ast.js';

export type BlockKind = 'layout' | 'content' | 'control' | 'structure' | 'media' | 'data';

export type BlockSpec = {
  kind: BlockKind;
  /** Props that must be present for the node to validate. */
  requiredProps?: readonly string[];
  /** Rich components decompose to primitives where unsupported. */
  rich?: boolean;
  decomposeTo?: (node: MosaicNode) => MosaicNode;
};

function prop(node: MosaicNode, name: string): PropValue | undefined {
  return node.props?.[name];
}

function asString(v: PropValue | undefined, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function altFallback(node: MosaicNode, label: string): MosaicNode {
  const alt = asString(prop(node, 'alt'), `[${label}]`);
  return { type: 'Text', props: { tone: 'subtle' }, children: [textNode(alt)] };
}

/** Rows/columns to a plain table of Text rows (the DataTable floor). */
function tableFallback(node: MosaicNode): MosaicNode {
  const columns = prop(node, 'columns');
  const rows = prop(node, 'rows');
  const children: MosaicNode[] = [];
  if (Array.isArray(columns)) {
    children.push({
      type: 'Text',
      props: { weight: 'bold' },
      children: [textNode(columns.map((c) => asString(c as PropValue, String(c))).join(' | '))],
    });
  }
  if (Array.isArray(rows)) {
    for (const row of rows) {
      if (!Array.isArray(row)) continue;
      children.push({
        type: 'Text',
        children: [textNode(row.map((c) => (typeof c === 'object' ? '' : String(c))).join(' | '))],
      });
    }
  }
  return { type: 'Stack', props: { gap: '1' }, children };
}

function records(v: PropValue | undefined): Array<Record<string, PropValue>> {
  if (!Array.isArray(v)) return [];
  return v.filter(
    (item): item is Record<string, PropValue> =>
      item !== null && typeof item === 'object' && !Array.isArray(item),
  );
}

/** Alt, grouped node lines, then one "a -> b" line per edge (the Diagram floor). */
function diagramFallback(node: MosaicNode): MosaicNode {
  const nodes = records(prop(node, 'nodes'));
  const groups = records(prop(node, 'groups'));
  const edges = records(prop(node, 'edges'));

  const labelOf = new Map<PropValue | undefined, string>();
  for (const g of groups) labelOf.set(g.id, asString(g.label, asString(g.id)));
  for (const n of nodes) labelOf.set(n.id, asString(n.label, asString(n.id)));

  const heading = (text: string): MosaicNode => ({
    type: 'Text',
    props: { weight: 'bold' },
    children: [textNode(text)],
  });
  const line = (text: string): MosaicNode => ({ type: 'Text', children: [textNode(text)] });
  const nodeLine = (n: Record<string, PropValue>): MosaicNode => {
    const label = asString(n.label, asString(n.id));
    const kind = asString(n.kind);
    return line(kind ? `- ${label} (${kind})` : `- ${label}`);
  };

  const children: MosaicNode[] = [heading(asString(prop(node, 'alt'), '[diagram]'))];
  for (const g of groups) {
    children.push(heading(asString(g.label, asString(g.id))));
    for (const n of nodes) if (n.group === g.id) children.push(nodeLine(n));
  }
  const groupIds = new Set<PropValue | undefined>(groups.map((g) => g.id));
  const ungrouped = nodes.filter((n) => !groupIds.has(n.group));
  if (ungrouped.length > 0) {
    if (groups.length > 0) children.push(heading('Nodes'));
    for (const n of ungrouped) children.push(nodeLine(n));
  }
  for (const e of edges) {
    const from = labelOf.get(e.from) ?? asString(e.from);
    const to = labelOf.get(e.to) ?? asString(e.to);
    const label = asString(e.label);
    children.push(line(label ? `${from} -> ${to} - ${label}` : `${from} -> ${to}`));
  }
  return { type: 'Stack', props: { gap: '1' }, children };
}

function itemsFallback(
  node: MosaicNode,
  render: (item: Record<string, PropValue>) => string,
): MosaicNode {
  const items = prop(node, 'items');
  const children: MosaicNode[] = [];
  if (Array.isArray(items)) {
    for (const item of items) {
      if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
        children.push({
          type: 'Text',
          children: [textNode(render(item as Record<string, PropValue>))],
        });
      } else {
        children.push({ type: 'Text', children: [textNode(String(item))] });
      }
    }
  }
  return { type: 'Stack', props: { gap: '1' }, children };
}

export const BLOCK_REGISTRY: Readonly<Record<string, BlockSpec>> = {
  // layout
  Box: { kind: 'layout' },
  Stack: { kind: 'layout' },
  Grid: { kind: 'layout' },
  Divider: { kind: 'layout' },
  Card: { kind: 'layout' },

  // content
  Text: { kind: 'content' },
  Heading: { kind: 'content' },
  Markdown: { kind: 'content' },
  Image: { kind: 'content', requiredProps: ['alt'] },
  Icon: { kind: 'content' },
  Link: { kind: 'content' },
  Badge: { kind: 'content' },
  Tag: { kind: 'content' },
  Avatar: { kind: 'content' },
  AvatarGroup: { kind: 'content' },
  Code: { kind: 'content' },
  Callout: { kind: 'content' },

  // controls
  Button: { kind: 'control' },
  Input: { kind: 'control' },
  Select: { kind: 'control' },
  MultiSelect: { kind: 'control' },
  Autocomplete: { kind: 'control' },
  Checkbox: { kind: 'control' },
  Radio: { kind: 'control' },
  Toggle: { kind: 'control' },
  Slider: { kind: 'control' },
  DatePicker: { kind: 'control' },
  ColorPicker: { kind: 'control' },
  FilePicker: { kind: 'control' },
  Rating: { kind: 'control' },
  TagInput: { kind: 'control' },
  Field: { kind: 'control' },
  Disclosure: { kind: 'control' },
  Accordion: { kind: 'control' },

  // structure & status
  Tabs: { kind: 'structure' },
  Steps: { kind: 'structure' },
  SegmentedControl: { kind: 'structure' },
  Progress: { kind: 'structure' },
  Empty: { kind: 'structure' },

  // media
  Video: { kind: 'media', requiredProps: ['alt'] },
  Audio: { kind: 'media' },
  Carousel: { kind: 'media' },

  // data & viz (rich: every one decomposes to primitives)
  DataTable: { kind: 'data', rich: true, decomposeTo: tableFallback },
  List: {
    kind: 'data',
    rich: true,
    decomposeTo: (node) => ({ type: 'Stack', props: { gap: '1' }, children: node.children }),
  },
  Tree: {
    kind: 'data',
    rich: true,
    decomposeTo: (node) => itemsFallback(node, (i) => asString(i.label, JSON.stringify(i))),
  },
  Board: {
    kind: 'data',
    rich: true,
    decomposeTo: (node) => itemsFallback(node, (i) => asString(i.title, JSON.stringify(i))),
  },
  Timeline: {
    kind: 'data',
    rich: true,
    decomposeTo: (node) =>
      itemsFallback(node, (i) => {
        const head = `${asString(i.date)} - ${asString(i.title)}`.trim();
        const description = asString(i.description);
        return description ? `${head} - ${description}` : head;
      }),
  },
  Calendar: {
    kind: 'data',
    rich: true,
    decomposeTo: (node) =>
      itemsFallback(node, (i) => `${asString(i.date)} - ${asString(i.title)}`.trim()),
  },
  Stat: {
    kind: 'data',
    rich: true,
    decomposeTo: (node) => {
      const label = asString(prop(node, 'label'));
      const value = prop(node, 'value');
      const text = typeof value === 'object' && value !== null ? '' : String(value ?? '');
      return { type: 'Text', children: [textNode(`${label}: ${text}`)] };
    },
  },
  Chart: {
    kind: 'data',
    rich: true,
    requiredProps: ['alt'],
    decomposeTo: (n) => altFallback(n, 'chart'),
  },
  VegaChart: {
    kind: 'data',
    rich: true,
    requiredProps: ['alt'],
    decomposeTo: (n) => altFallback(n, 'chart'),
  },
  Diagram: {
    kind: 'data',
    rich: true,
    requiredProps: ['alt'],
    decomposeTo: diagramFallback,
  },
  Canvas: {
    kind: 'data',
    rich: true,
    requiredProps: ['alt'],
    decomposeTo: (n) => altFallback(n, 'diagram'),
  },
  Embed: { kind: 'data', rich: true, decomposeTo: (n) => altFallback(n, 'embedded content') },
};

export function blockSpec(type: string): BlockSpec | undefined {
  return BLOCK_REGISTRY[type];
}

export function isKnownBlock(type: string): boolean {
  return type in BLOCK_REGISTRY;
}
